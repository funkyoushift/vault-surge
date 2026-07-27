/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { terminalStatuses, type EffectLifecycleStatus } from "../lib/contracts/commands";
import type { QueuedCommand } from "../lib/backend/command-queue";

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
