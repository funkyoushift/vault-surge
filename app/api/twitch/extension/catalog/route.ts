import { toPublicEffectDefinition } from "../../../../../lib/contracts/public-effects";
import { effectCatalog } from "../../../../../lib/contracts/effects";
import { extensionCorsHeaders, extensionOptions } from "../../../../../lib/twitch/cors";
import { verifyTwitchExtensionJwt } from "../../../../../lib/twitch/extension-jwt";

export const OPTIONS = extensionOptions;

export async function GET(request: Request) {
  const headers = extensionCorsHeaders(request);
  try {
    await verifyTwitchExtensionJwt(request.headers.get("x-extension-jwt") ?? "");
    return Response.json({
      effects: effectCatalog.map(toPublicEffectDefinition).filter(Boolean),
    }, { headers });
  } catch (error) {
    const unavailable = error instanceof Error && error.message.includes("not configured");
    return Response.json(
      { error: unavailable ? "Extension verification is not configured." : "Extension authorization failed." },
      { status: unavailable ? 503 : 401, headers },
    );
  }
}
