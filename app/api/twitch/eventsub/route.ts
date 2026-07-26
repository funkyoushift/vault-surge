import {
  readEventSubHeaders,
  verifyEventSubRequest,
} from "../../../../lib/twitch/eventsub";

interface EventSubEnvelope {
  challenge?: string;
  subscription?: { id?: string; type?: string; status?: string };
  event?: unknown;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const headers = readEventSubHeaders(request.headers);
  try {
    await verifyEventSubRequest(headers, rawBody);
  } catch (error) {
    const notConfigured = error instanceof Error && error.message.includes("not configured");
    return Response.json(
      { error: notConfigured ? "EventSub verification is not configured." : "EventSub signature verification failed." },
      { status: notConfigured ? 503 : 403 },
    );
  }

  let message: EventSubEnvelope;
  try {
    message = JSON.parse(rawBody) as EventSubEnvelope;
  } catch {
    return Response.json({ error: "EventSub body must be valid JSON." }, { status: 400 });
  }

  if (headers.messageType === "webhook_callback_verification" && message.challenge) {
    return new Response(message.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
  if (headers.messageType === "notification" || headers.messageType === "revocation") {
    // Persistence and command creation are intentionally deferred until the
    // idempotency store is present. Acknowledge only verified Twitch messages.
    return new Response(null, { status: 204 });
  }
  return Response.json({ error: "Unsupported EventSub message type." }, { status: 400 });
}
