import {
  readEventSubHeaders,
  verifyEventSubRequest,
} from "../../../../lib/twitch/eventsub";
import { creditChannelPointSparks } from "../../../../lib/backend/viewer-wallet";
import { sparksFromChannelPointRewardTitle } from "../../../../lib/contracts/channel-point-sparks";

interface EventSubEnvelope {
  challenge?: string;
  subscription?: { id?: string; type?: string; status?: string };
  event?: unknown;
}

interface ChannelPointRedemptionEvent {
  id?: string;
  broadcaster_user_id?: string;
  user_id?: string;
  reward?: {
    id?: string;
    title?: string;
    cost?: number;
  };
}

async function handleNotification(message: EventSubEnvelope): Promise<Response> {
  if (message.subscription?.type !== "channel.channel_points_custom_reward_redemption.add") {
    return new Response(null, { status: 204 });
  }
  const event = message.event as ChannelPointRedemptionEvent;
  const redemptionId = event.id;
  const channelId = event.broadcaster_user_id;
  const userId = event.user_id;
  const rewardTitle = event.reward?.title ?? "";
  const sparks = sparksFromChannelPointRewardTitle(rewardTitle);
  if (!redemptionId || !channelId || !userId || !sparks) {
    return new Response(null, { status: 204 });
  }
  await creditChannelPointSparks(channelId, userId, redemptionId, sparks);
  return new Response(null, { status: 204 });
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
  if (headers.messageType === "notification") {
    return handleNotification(message);
  }
  if (headers.messageType === "revocation") {
    return new Response(null, { status: 204 });
  }
  return Response.json({ error: "Unsupported EventSub message type." }, { status: 400 });
}
