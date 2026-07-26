import {
  clearCookie,
  exchangeAuthorizationCode,
  getTwitchServerConfig,
  readCookie,
  safeEqual,
  sealTwitchSession,
  serializeCookie,
  twitchOAuthStateCookie,
  twitchSessionCookie,
  verifyOAuthState,
} from "../../../../../lib/twitch/server";

function redirectWithStatus(redirectUri: string, status: string, detail?: string) {
  const url = new URL("/", redirectUri);
  url.searchParams.set("twitch", status);
  if (detail) url.searchParams.set("detail", detail.slice(0, 120));
  return url;
}

export async function GET(request: Request) {
  const config = getTwitchServerConfig();
  if (!config) return Response.redirect(new URL("/?twitch=not_configured", request.url), 302);

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return Response.redirect(redirectWithStatus(config.redirectUri, "denied", error), 302);

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const expectedState = readCookie(request, twitchOAuthStateCookie);
  const cookieStateMatches = Boolean(expectedState) && safeEqual(state, expectedState);
  const signedStateMatches = Boolean(state) && await verifyOAuthState(state, config.sessionSecret);
  if (!code || (!cookieStateMatches && !signedStateMatches)) {
    return Response.redirect(redirectWithStatus(config.redirectUri, "invalid_state"), 302);
  }

  try {
    const session = await exchangeAuthorizationCode(config, code);
    const response = new Response(null, {
      status: 302,
      headers: { Location: redirectWithStatus(config.redirectUri, "connected").toString() },
    });
    response.headers.append(
      "Set-Cookie",
      serializeCookie(
        twitchSessionCookie,
        await sealTwitchSession(session, config.sessionSecret),
        request,
        { maxAge: 60 * 60 * 24 * 30 },
      ),
    );
    response.headers.append("Set-Cookie", clearCookie(twitchOAuthStateCookie, request, "/api/twitch/oauth"));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.redirect(redirectWithStatus(config.redirectUri, "exchange_failed"), 302);
  }
}
