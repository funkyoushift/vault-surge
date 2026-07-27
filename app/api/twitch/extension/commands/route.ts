import { enqueueViewerCommand } from "../../../../../lib/backend/command-queue";
import { effectByKey } from "../../../../../lib/contracts/effects";
import { extensionCorsHeaders, extensionOptions } from "../../../../../lib/twitch/cors";
import { verifyTwitchExtensionJwt } from "../../../../../lib/twitch/extension-jwt";

export const OPTIONS = extensionOptions;

export async function POST(request: Request) {
  const headers = extensionCorsHeaders(request);
  try {
    const claims = await verifyTwitchExtensionJwt(request.headers.get("x-extension-jwt") ?? "");
    const body = await request.json() as {
      effectKey?: unknown;
      viewerParameters?: unknown;
      monetization?: unknown;
    };
    const effect = typeof body.effectKey === "string" ? effectByKey.get(body.effectKey) : undefined;
    if (!effect) return Response.json({ error: "Unknown effect." }, { status: 400, headers });
    const viewerParameters = body.viewerParameters && typeof body.viewerParameters === "object"
      ? Object.fromEntries(Object.entries(body.viewerParameters).map(([key, value]) => [key, String(value)]))
      : {};
    const monetization = body.monetization && typeof body.monetization === "object"
      ? body.monetization as Record<string, unknown>
      : {};
    const bitsSku = typeof monetization.sku === "string" ? monetization.sku : "";
    const transactionId = typeof monetization.transactionId === "string" ? monetization.transactionId : "";
    const expectedSku = `vaultsurge.${effect.key}`;
    if (bitsSku && bitsSku !== expectedSku) return Response.json({ error: "Bits SKU does not match effect." }, { status: 400, headers });
    const command = await enqueueViewerCommand(claims, effect, viewerParameters, {
      monetization: bitsSku
        ? {
            source: "bits",
            sku: bitsSku,
            transactionId,
            amount: effect.defaultCreditCost,
          }
        : { source: "development" },
    });
    return Response.json({
      accepted: true,
      command: {
        id: command.id,
        effectKey: command.effectKey,
        status: command.status,
        statusDetail: command.statusDetail,
        createdAt: command.createdAt,
      },
    }, { status: 202, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const authorization = message.includes("JWT") || message.includes("authorization");
    const unavailable = message.includes("not configured") || message.includes("not accepting");
    return Response.json(
      { error: authorization ? "Extension authorization failed." : message },
      { status: authorization ? 401 : unavailable ? 503 : 409, headers },
    );
  }
}
