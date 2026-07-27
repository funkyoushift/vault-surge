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
    console.log("eventsub.ignored", {
      type: message.subscription?.type ?? "missing",
    });
    return new Response(null, { status: 204 });
  }
  const event = message.event as ChannelPointRedemptionEvent;
  const redemptionId = event.id;
  const channelId = event.broadcaster_user_id;
  const userId = event.user_id;
  const rewardTitle = event.reward?.title ?? "";
  const sparks = sparksFromChannelPointRewardTitle(rewardTitle);
  if (!redemptionId || !channelId || !userId || !sparks) {
    console.warn("eventsub.channel_points.skipped", {
      hasRedemptionId: Boolean(redemptionId),
      hasChannelId: Boolean(channelId),
      hasUserId: Boolean(userId),
      rewardTitle,
      sparks,
    });
    return new Response(null, { status: 204 });
  }
  try {
    const wallet = await creditChannelPointSparks(channelId, userId, redemptionId, sparks);
    console.log("eventsub.channel_points.credited", {
      rewardTitle,
      sparks,
      channelIdSuffix: channelId.slice(-4),
      userIdSuffix: userId.slice(-4),
      balance: wallet.balance,
    });
  } catch (error) {
    console.error("eventsub.channel_points.credit_failed", {
      rewardTitle,
      sparks,
      channelIdSuffix: channelId.slice(-4),
      userIdSuffix: userId.slice(-4),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
    console.log("eventsub.challenge", {
      type: message.subscription?.type ?? "missing",
      status: message.subscription?.status ?? "missing",
    });
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
