import {
  enqueueLocalTestCommand,
  listCommands,
  updateCommandStatus,
} from "../../../../lib/backend/command-queue";
import type { EffectLifecycleStatus } from "../../../../lib/contracts/commands";
import {
  getCompanionState,
  setPaused,
  setSessionActive,
} from "../../../../lib/backend/companion-state";

function localRequest(request: Request, mutation = false): boolean {
  const url = new URL(request.url);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(url.hostname)) return false;
  if (!mutation) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    return localHosts.has(originUrl.hostname) && originUrl.port === "3000";
  } catch {
    return false;
  }
}

async function sdkStatus() {
  try {
    const response = await fetch("http://127.0.0.1:49775/v1/status", {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) throw new Error(`SDK returned ${response.status}.`);
    return await response.json();
  } catch {
    return { ok: false, started: false, paired: false, last_error: "Borderlands 4 SDK adapter is offline." };
  }
}

export async function GET(request: Request) {
  if (!localRequest(request)) return Response.json({ error: "Local companion only." }, { status: 403 });
  return Response.json(
    { commands: listCommands(), sdk: await sdkStatus(), state: getCompanionState() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!localRequest(request, true)) return Response.json({ error: "Local companion only." }, { status: 403 });
  try {
    const body = await request.json() as {
      action?: unknown;
      id?: unknown;
      effectKey?: unknown;
      requiresApproval?: unknown;
      viewerParameters?: unknown;
    };
    if (body.action === "test") {
      if (typeof body.effectKey !== "string") throw new Error("Effect key is required.");
      const viewerParameters = body.viewerParameters && typeof body.viewerParameters === "object"
        ? body.viewerParameters as Record<string, string>
        : {};
      return Response.json({
        command: await enqueueLocalTestCommand(
          body.effectKey,
          viewerParameters,
          body.requiresApproval === true,
        ),
      });
    }
    if (body.action === "set-session") {
      return Response.json({ state: setSessionActive(body.id === "true") });
    }
    if (body.action === "set-pause") {
      return Response.json({ state: setPaused(body.id === "true") });
    }
    if (typeof body.id !== "string" || typeof body.action !== "string") {
      throw new Error("Command action and id are required.");
    }
    const statuses: Record<string, EffectLifecycleStatus> = {
      approve: "approved",
      reject: "rejected",
      retry: "approved",
      cancel: "cancelled",
    };
    const status = statuses[body.action];
    if (!status) throw new Error("Unsupported local command action.");
    return Response.json({ command: updateCommandStatus(body.id, status) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Local command failed." },
      { status: 400 },
    );
  }
}
