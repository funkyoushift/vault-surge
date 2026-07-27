import { creditSparkPurchase, getViewerWallet } from "../../../../../lib/backend/viewer-wallet";
import { sparkPacks } from "../../../../../lib/contracts/spark-packs";
import { extensionCorsHeaders, extensionOptions } from "../../../../../lib/twitch/cors";
import { verifyTwitchExtensionJwt } from "../../../../../lib/twitch/extension-jwt";

export const OPTIONS = extensionOptions;

export async function GET(request: Request) {
  const headers = extensionCorsHeaders(request);
  try {
    const claims = await verifyTwitchExtensionJwt(request.headers.get("x-extension-jwt") ?? "");
    return Response.json({
      wallet: await getViewerWallet(claims),
      sparkPacks,
    }, { headers });
  } catch (error) {
    const unavailable = error instanceof Error && error.message.includes("not configured");
    return Response.json(
      { error: unavailable ? "Extension verification is not configured." : "Extension authorization failed." },
      { status: unavailable ? 503 : 401, headers },
    );
  }
}

export async function POST(request: Request) {
  const headers = extensionCorsHeaders(request);
  try {
    const claims = await verifyTwitchExtensionJwt(request.headers.get("x-extension-jwt") ?? "");
    const body = await request.json() as {
      sku?: unknown;
      transactionId?: unknown;
      transactionReceipt?: unknown;
    };
    if (
      typeof body.sku !== "string"
      || typeof body.transactionId !== "string"
      || typeof body.transactionReceipt !== "string"
    ) {
      return Response.json({ error: "Spark pack SKU, transaction id, and receipt are required." }, { status: 400, headers });
    }
    return Response.json({
      wallet: await creditSparkPurchase(claims, {
        sku: body.sku,
        transactionId: body.transactionId,
        transactionReceipt: body.transactionReceipt,
      }),
    }, { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Wallet update failed." },
      { status: 409, headers },
    );
  }
}
