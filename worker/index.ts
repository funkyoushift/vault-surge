/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { terminalStatuses, type EffectLifecycleStatus } from "../lib/contracts/commands";
import type { QueuedCommand } from "../lib/backend/command-queue";
import type { ViewerWallet } from "../lib/backend/viewer-wallet";

const DurableObjectBase = await import("cloudflare:workers")
  .then((module) => module.DurableObject)
  .catch(() => class {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;

    constructor(ctx: DurableObjectState, env: Env) {
      this.ctx = ctx;
      this.env = env;
    }
  });

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  VAULT_SURGE_COMMAND_QUEUE: DurableObjectNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const companionStatuses = new Set<EffectLifecycleStatus>([
  "approved", "rejected", "dispatched", "running", "completed", "retryable", "failed", "cancelled",
]);

export class VaultSurgeCommandQueue extends DurableObjectBase {
  declare protected readonly ctx: DurableObjectState;

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/enqueue") {
        const body = await request.json() as { command?: QueuedCommand };
        if (!body.command) return new Response("Command is required.", { status: 400 });
        return Response.json(await this.enqueue(body.command));
      }
      if (url.pathname === "/list") {
        return Response.json(await this.list());
      }
      if (url.pathname === "/update") {
        const body = await request.json() as {
          id?: unknown;
          status?: unknown;
          detail?: unknown;
        };
        if (typeof body.id !== "string" || typeof body.status !== "string") {
          return new Response("Command id and status are required.", { status: 400 });
        }
        return Response.json(await this.update(
          body.id,
          body.status as EffectLifecycleStatus,
          typeof body.detail === "string" ? body.detail : undefined,
        ));
      }
      if (url.pathname === "/wallet") {
        const body = await request.json() as { viewerId?: unknown };
        if (typeof body.viewerId !== "string") return new Response("Viewer id is required.", { status: 400 });
        return Response.json(await this.wallet(body.viewerId));
      }
      if (url.pathname === "/wallet-credit") {
        const body = await request.json() as {
          viewerId?: unknown;
          source?: unknown;
          sku?: unknown;
          transactionId?: unknown;
          amount?: unknown;
        };
        if (typeof body.viewerId !== "string" || typeof body.transactionId !== "string" || typeof body.amount !== "number") {
          return new Response("Viewer id, transaction id, and amount are required.", { status: 400 });
        }
        return Response.json(await this.creditWallet(
          body.viewerId,
          body.amount,
          body.transactionId,
          typeof body.source === "string" ? body.source : "unknown",
          typeof body.sku === "string" ? body.sku : undefined,
        ));
      }
      if (url.pathname === "/wallet-spend") {
        const body = await request.json() as {
          viewerId?: unknown;
          amount?: unknown;
          commandId?: unknown;
        };
        if (typeof body.viewerId !== "string" || typeof body.amount !== "number" || typeof body.commandId !== "string") {
          return new Response("Viewer id, amount, and command id are required.", { status: 400 });
        }
        return Response.json(await this.spendWallet(body.viewerId, body.amount, body.commandId));
      }
      return new Response("Not found.", { status: 404 });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Command queue failed.", { status: 400 });
    }
  }

  private async readCommands(): Promise<QueuedCommand[]> {
    return (await this.ctx.storage.get<QueuedCommand[]>("commands")) ?? [];
  }

  private async writeCommands(commands: QueuedCommand[]): Promise<void> {
    await this.ctx.storage.put("commands", commands.slice(0, 250));
  }

  private expireCommands(commands: QueuedCommand[]): boolean {
    const now = Date.now();
    let changed = false;
    for (const command of commands) {
      if (!terminalStatuses.includes(command.status) && Date.parse(command.expiresAt) <= now) {
        command.status = "expired";
        command.statusDetail = "Command expired before dispatch.";
        changed = true;
      }
    }
    return changed;
  }

  async enqueue(command: QueuedCommand): Promise<QueuedCommand> {
    const commands = await this.readCommands();
    this.expireCommands(commands);
    commands.unshift(command);
    await this.writeCommands(commands);
    return command;
  }

  async list(): Promise<QueuedCommand[]> {
    const commands = await this.readCommands();
    if (this.expireCommands(commands)) await this.writeCommands(commands);
    return commands;
  }

  async update(id: string, status: EffectLifecycleStatus, detail?: string): Promise<QueuedCommand> {
    if (!companionStatuses.has(status)) throw new Error("Unsupported companion status.");
    const commands = await this.readCommands();
    this.expireCommands(commands);
    const command = commands.find((item) => item.id === id);
    if (!command) throw new Error("Command was not found.");
    command.status = status;
    command.statusDetail = detail?.slice(0, 240) || `Companion reported ${status}.`;
    await this.writeCommands(commands);
    return command;
  }

  private async readWallets(): Promise<Record<string, ViewerWallet>> {
    return (await this.ctx.storage.get<Record<string, ViewerWallet>>("wallets")) ?? {};
  }

  private async writeWallets(wallets: Record<string, ViewerWallet>): Promise<void> {
    await this.ctx.storage.put("wallets", wallets);
  }

  private emptyWallet(): ViewerWallet {
    return { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 };
  }

  async wallet(viewerId: string): Promise<ViewerWallet> {
    const wallets = await this.readWallets();
    return wallets[viewerId] ?? this.emptyWallet();
  }

  async creditWallet(
    viewerId: string,
    amount: number,
    transactionId: string,
    source: string,
    sku?: string,
  ): Promise<ViewerWallet> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Credit amount is invalid.");
    const transactionKey = `wallet-transaction:${source}:${transactionId}`;
    const existing = await this.ctx.storage.get(transactionKey);
    if (existing) return this.wallet(viewerId);
    const wallets = await this.readWallets();
    const wallet = wallets[viewerId] ?? this.emptyWallet();
    wallet.balance += Math.floor(amount);
    wallet.lifetimeEarned += Math.floor(amount);
    wallets[viewerId] = wallet;
    await this.ctx.storage.put(transactionKey, {
      viewerId,
      source,
      sku,
      amount: Math.floor(amount),
      createdAt: new Date().toISOString(),
    });
    await this.writeWallets(wallets);
    return wallet;
  }

  async spendWallet(viewerId: string, amount: number, commandId: string): Promise<ViewerWallet> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Spend amount is invalid.");
    const transactionKey = `wallet-transaction:command:${commandId}`;
    const existing = await this.ctx.storage.get(transactionKey);
    if (existing) return this.wallet(viewerId);
    const wallets = await this.readWallets();
    const wallet = wallets[viewerId] ?? this.emptyWallet();
    const normalizedAmount = Math.floor(amount);
    if (wallet.balance < normalizedAmount) throw new Error("Not enough Sparks.");
    wallet.balance -= normalizedAmount;
    wallet.lifetimeSpent += normalizedAmount;
    wallets[viewerId] = wallet;
    await this.ctx.storage.put(transactionKey, {
      viewerId,
      source: "command",
      amount: normalizedAmount,
      createdAt: new Date().toISOString(),
    });
    await this.writeWallets(wallets);
    return wallet;
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
