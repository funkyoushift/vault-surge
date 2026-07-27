import {
  terminalStatuses,
  type CommandEnvelope,
  type EffectLifecycleStatus,
} from "../contracts/commands";
import {
  effectByKey,
  validateEffectInputs,
  type EffectDefinition,
  type EffectViewerParameters,
} from "../contracts/effects";
import type { TwitchExtensionClaims } from "../twitch/extension-jwt";
import { getCompanionState } from "./companion-state";
import { twitchViewerId } from "./viewer-wallet";

export interface QueuedCommand extends CommandEnvelope {
  channelId: string;
}

const queue: QueuedCommand[] = [];
const lastGlobalUse = new Map<string, number>();
const lastViewerUse = new Map<string, number>();
const encoder = new TextEncoder();

type CommandQueueDurableObject = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

function configured(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized && !normalized.startsWith("replace_with_") ? normalized : "";
}

function configuredChannelId(channelId?: string): string {
  return configured(channelId) || configured(process.env.VAULT_SURGE_LOCAL_CHANNEL_ID) || "local-development";
}

async function durableQueue(channelId?: string): Promise<CommandQueueDurableObject | undefined> {
  try {
    const workers = await import("cloudflare:workers");
    const bindings = workers.env as unknown as {
      VAULT_SURGE_COMMAND_QUEUE?: DurableObjectNamespace;
    };
    const namespace = bindings.VAULT_SURGE_COMMAND_QUEUE;
    if (!namespace) return undefined;
    return namespace.getByName(configuredChannelId(channelId)) as unknown as CommandQueueDurableObject;
  } catch {
    return undefined;
  }
}

async function durableRequest<T>(
  action: "enqueue" | "list" | "update",
  channelId: string | undefined,
  body?: unknown,
): Promise<T | undefined> {
  const durable = await durableQueue(channelId);
  if (!durable) return undefined;
  const response = await durable.fetch(`https://vault-surge-command-queue.local/${action}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Command queue ${action} failed.`);
  }
  return await response.json() as T;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(command: Omit<QueuedCommand, "signature">): Promise<string> {
  const secret = configured(process.env.COMMAND_SIGNING_SECRET);
  if (!secret) throw new Error("Command signing is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = JSON.stringify({
    id: command.id,
    channelId: command.channelId,
    effectKey: command.effectKey,
    viewerId: command.viewerId,
    viewerParameters: command.viewerParameters,
    adapterParameters: command.adapterParameters,
    createdAt: command.createdAt,
    expiresAt: command.expiresAt,
    nonce: command.nonce,
  });
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

function assertSession(claims: TwitchExtensionClaims): void {
  const hostedTestAlwaysActive = configured(process.env.VAULT_SURGE_LOCAL_SESSION_ACTIVE) === "true";
  const companionState = getCompanionState();
  if (!hostedTestAlwaysActive && (!companionState.sessionActive || companionState.paused)) {
    throw new Error("The streamer session is not accepting requests.");
  }
  const channelId = configured(process.env.VAULT_SURGE_LOCAL_CHANNEL_ID);
  if (channelId && channelId !== claims.channel_id) {
    throw new Error("This channel is not paired with the local companion.");
  }
}

function assertCooldown(effect: EffectDefinition, claims: TwitchExtensionClaims, now: number): void {
  const globalKey = `${claims.channel_id}:${effect.key}`;
  const viewerKey = `${globalKey}:${claims.user_id ? twitchViewerId(claims.user_id) : claims.opaque_user_id}`;
  const globalWait = effect.cooldowns.globalSeconds * 1000 - (now - (lastGlobalUse.get(globalKey) ?? 0));
  const viewerWait = effect.cooldowns.perViewerSeconds * 1000 - (now - (lastViewerUse.get(viewerKey) ?? 0));
  if (globalWait > 0 || viewerWait > 0) {
    throw new Error(`Effect is cooling down for ${Math.ceil(Math.max(globalWait, viewerWait) / 1000)} seconds.`);
  }
  lastGlobalUse.set(globalKey, now);
  lastViewerUse.set(viewerKey, now);
}

export async function enqueueViewerCommand(
  claims: TwitchExtensionClaims,
  effect: EffectDefinition,
  rawViewerParameters: EffectViewerParameters,
  options: {
    skipCooldown?: boolean;
    allowDisabled?: boolean;
    allowRestricted?: boolean;
    monetization?: QueuedCommand["monetization"];
  } = {},
): Promise<QueuedCommand> {
  assertSession(claims);
  if (
    (!effect.enabled && !options.allowDisabled)
    || (effect.riskLevel === "restricted" && !options.allowRestricted)
  ) {
    throw new Error("Effect is unavailable.");
  }
  const validation = validateEffectInputs(effect, rawViewerParameters);
  if (!validation.ok) throw new Error(validation.error);
  const now = Date.now();
  if (!options.skipCooldown) assertCooldown(effect, claims, now);
  const unsigned: Omit<QueuedCommand, "signature"> = {
    id: crypto.randomUUID(),
    channelId: claims.channel_id,
    effectKey: effect.key,
    viewerId: claims.user_id ? twitchViewerId(claims.user_id) : claims.opaque_user_id,
    viewerDisplayName: claims.user_id ? `twitch:${claims.user_id}` : claims.opaque_user_id,
    quantity: 1,
    unitCreditCost: effect.defaultCreditCost,
    monetization: options.monetization ?? { source: "development" },
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 120_000).toISOString(),
    nonce: crypto.randomUUID(),
    status: effect.requiresApproval ? "queued" : "validated",
    statusDetail: effect.requiresApproval ? "Waiting for streamer approval." : "Validated by the authoritative catalog.",
    attempt: 1,
    adapterParameters: effect.adapterParameters,
    viewerParameters: validation.parameters,
  };
  const command: QueuedCommand = { ...unsigned, signature: await sign(unsigned) };
  const durableCommand = await durableRequest<QueuedCommand>("enqueue", command.channelId, { command });
  if (durableCommand) return durableCommand;
  queue.unshift(command);
  if (queue.length > 250) queue.length = 250;
  return command;
}

export async function enqueueLocalTestCommand(
  effectKey: string,
  rawViewerParameters: EffectViewerParameters = {},
  requiresApproval = false,
): Promise<QueuedCommand> {
  const effect = effectByKey.get(effectKey);
  if (!effect) throw new Error("Unknown catalog effect.");
  const localEffect = { ...effect, requiresApproval };
  const channelId = configuredChannelId();
  return enqueueViewerCommand(
    {
      channel_id: channelId,
      exp: Math.floor(Date.now() / 1000) + 300,
      opaque_user_id: "U_LOCAL_COMPANION_TEST",
      role: "broadcaster",
      user_id: "local-broadcaster",
    },
    localEffect,
    Object.keys(rawViewerParameters).length > 0
      ? rawViewerParameters
      : Object.fromEntries((localEffect.inputs ?? []).map((input) => [
          input.key,
          input.kind === "select" ? input.defaultValue : localEffect.key === "barrel_message" ? "VAULT SURGE LIVE" : "",
        ])),
    { skipCooldown: true, allowDisabled: true, allowRestricted: true },
  );
}

export async function listCommands(channelId?: string): Promise<QueuedCommand[]> {
  const durableCommands = await durableRequest<QueuedCommand[]>("list", channelId);
  if (durableCommands) return durableCommands;
  const now = Date.now();
  for (const command of queue) {
    if (!terminalStatuses.includes(command.status) && Date.parse(command.expiresAt) <= now) {
      command.status = "expired";
      command.statusDetail = "Command expired before dispatch.";
    }
  }
  return queue.filter((command) => !channelId || command.channelId === channelId);
}

const companionStatuses = new Set<EffectLifecycleStatus>([
  "approved", "rejected", "dispatched", "running", "completed", "retryable", "failed", "cancelled",
]);

export async function updateCommandStatus(
  id: string,
  status: EffectLifecycleStatus,
  detail?: string,
): Promise<QueuedCommand> {
  if (!companionStatuses.has(status)) throw new Error("Unsupported companion status.");
  const durableCommand = await durableRequest<QueuedCommand>("update", undefined, { id, status, detail });
  if (durableCommand) return durableCommand;
  const command = queue.find((item) => item.id === id);
  if (!command) throw new Error("Command was not found.");
  command.status = status;
  command.statusDetail = detail?.slice(0, 240) || `Companion reported ${status}.`;
  return command;
}
