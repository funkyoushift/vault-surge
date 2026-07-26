import {
  broadcasterScopes,
  getBroadcasterSession,
  isTwitchOAuthConfigured,
} from "../../../../lib/twitch/server";

export async function GET(request: Request) {
  const { session, refreshedCookie } = await getBroadcasterSession(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (refreshedCookie) headers.set("Set-Cookie", refreshedCookie);
  return Response.json({
    configured: isTwitchOAuthConfigured(),
    connected: Boolean(session),
    broadcaster: session ? {
      id: session.broadcasterId,
      login: session.broadcasterLogin,
      scopes: session.scopes,
    } : null,
    requiredScopes: broadcasterScopes,
    extensionVerificationConfigured: Boolean(
      process.env.TWITCH_EXTENSION_SECRET &&
      !process.env.TWITCH_EXTENSION_SECRET.startsWith("replace_with_")
    ),
    eventSubVerificationConfigured: Boolean(
      process.env.TWITCH_EVENTSUB_SECRET &&
      !process.env.TWITCH_EVENTSUB_SECRET.startsWith("replace_with_")
    ),
  }, { headers });
}
