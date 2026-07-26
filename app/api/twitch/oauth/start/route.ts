import {
  createOAuthState,
  createAuthorizationUrl,
  getTwitchServerConfig,
  serializeCookie,
  twitchOAuthStateCookie,
} from "../../../../../lib/twitch/server";

export async function GET(request: Request) {
  const config = getTwitchServerConfig();
  if (!config) {
    return Response.json(
      { error: "Twitch OAuth is not configured. Add the server-only Twitch environment values first." },
      { status: 503 },
    );
  }
  const state = await createOAuthState(config.sessionSecret);
  return new Response(null, {
    status: 302,
    headers: {
      Location: createAuthorizationUrl(config, state),
      "Set-Cookie": serializeCookie(twitchOAuthStateCookie, state, request, {
        maxAge: 10 * 60,
        path: "/api/twitch/oauth",
      }),
      "Cache-Control": "no-store",
    },
  });
}
