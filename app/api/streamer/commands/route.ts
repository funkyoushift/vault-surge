import {
  listCommands,
  updateCommandStatus,
} from "../../../../lib/backend/command-queue";
import {
  getCompanionState,
  setPaused,
  setSessionActive,
} from "../../../../lib/backend/companion-state";
import type { EffectLifecycleStatus } from "../../../../lib/contracts/commands";

function authorized(request: Request): boolean {
  const expected = process.env.STREAMER_COMPANION_TOKEN?.trim();
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Companion authorization failed." }, { status: 401 });
  const channelId = new URL(request.url).searchParams.get("channelId") ?? undefined;
  return Response.json(
    { commands: await listCommands(channelId), state: getCompanionState() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Companion authorization failed." }, { status: 401 });
  try {
    const body = await request.json() as { action?: unknown; id?: unknown; status?: unknown; detail?: unknown };
    if (body.action === "set-session") {
      return Response.json({ state: setSessionActive(body.id === "true") });
    }
    if (body.action === "set-pause") {
      return Response.json({ state: setPaused(body.id === "true") });
    }
    if (typeof body.id !== "string" || typeof body.status !== "string") {
      return Response.json({ error: "Command id and status are required." }, { status: 400 });
    }
    const command = await updateCommandStatus(
      body.id,
      body.status as EffectLifecycleStatus,
      typeof body.detail === "string" ? body.detail : undefined,
    );
    return Response.json({ command });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Update failed." }, { status: 400 });
  }
}
