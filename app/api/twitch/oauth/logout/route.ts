import { clearCookie, twitchSessionCookie } from "../../../../../lib/twitch/server";

export async function POST(request: Request) {
  return Response.json(
    { connected: false },
    {
      headers: {
        "Set-Cookie": clearCookie(twitchSessionCookie, request),
        "Cache-Control": "no-store",
      },
    },
  );
}
