import {
  extensionIdentity,
  verifyTwitchExtensionJwt,
} from "../../../../../lib/twitch/extension-jwt";
import { extensionCorsHeaders, extensionOptions } from "../../../../../lib/twitch/cors";

export const OPTIONS = extensionOptions;

export async function POST(request: Request) {
  const headers = extensionCorsHeaders(request);
  const token = request.headers.get("x-extension-jwt") ?? "";
  if (!token) return Response.json({ error: "Extension JWT is required." }, { status: 401, headers });
  try {
    return Response.json({ authenticated: true, identity: extensionIdentity(await verifyTwitchExtensionJwt(token)) }, {
      headers,
    });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not configured")
      ? "Extension verification is not configured."
      : "Extension authorization failed.";
    return Response.json({ error: message }, { status: message.includes("not configured") ? 503 : 401, headers });
  }
}
