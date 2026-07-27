import {
  getBroadcasterSession,
  twitchAppHelixFetch,
} from "../../../../../lib/twitch/server";

type EventSubSubscription = {
  id: string;
  status: string;
  type: string;
  condition?: Record<string, string>;
  transport?: { method?: string; callback?: string };
};

type EventSubListResponse = {
  data: EventSubSubscription[];
  total: number;
};

type EventSubCreateResponse = {
  data: EventSubSubscription[];
};

function configured(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized && !normalized.startsWith("replace_with_") ? normalized : "";
}

function eventSubSecret(): string {
  return configured(process.env.TWITCH_EVENTSUB_SECRET);
}

function callbackUrl(request: Request): string {
  return configured(process.env.TWITCH_EVENTSUB_CALLBACK_URL)
    || `${new URL(request.url).origin}/api/twitch/eventsub`;
}

export async function GET(request: Request) {
  const { session, refreshedCookie } = await getBroadcasterSession(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (refreshedCookie) headers.set("Set-Cookie", refreshedCookie);
  if (!session) {
    return Response.json({ error: "Connect Twitch broadcaster OAuth first." }, { status: 401, headers });
  }
  const subscriptions = await twitchAppHelixFetch<EventSubListResponse>(
    "/eventsub/subscriptions?type=channel.channel_points_custom_reward_redemption.add",
  );
  return Response.json({
    callback: callbackUrl(request),
    subscriptions: subscriptions.data.filter((subscription) => (
      subscription.condition?.broadcaster_user_id === session.broadcasterId
    )),
  }, { headers });
}

export async function POST(request: Request) {
  const { session, refreshedCookie } = await getBroadcasterSession(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (refreshedCookie) headers.set("Set-Cookie", refreshedCookie);
  if (!session) {
    return Response.json({ error: "Connect Twitch broadcaster OAuth first." }, { status: 401, headers });
  }
  const secret = eventSubSecret();
  if (!secret) {
    return Response.json({ error: "TWITCH_EVENTSUB_SECRET is not configured." }, { status: 503, headers });
  }

  try {
    const created = await twitchAppHelixFetch<EventSubCreateResponse>(
      "/eventsub/subscriptions",
      {
        method: "POST",
        body: JSON.stringify({
          type: "channel.channel_points_custom_reward_redemption.add",
          version: "1",
          condition: {
            broadcaster_user_id: session.broadcasterId,
          },
          transport: {
            method: "webhook",
            callback: callbackUrl(request),
            secret,
          },
        }),
      },
    );
    return Response.json({ created: created.data }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EventSub setup failed.";
    if (message.toLowerCase().includes("subscription already exists") || message.includes("409")) {
      return Response.json({ ok: true, alreadyExists: true }, { headers });
    }
    return Response.json({ error: message }, { status: 409, headers });
  }
}
