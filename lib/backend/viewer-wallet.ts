import type { TwitchExtensionClaims } from "../twitch/extension-jwt";
import { sparkPackBySku } from "../contracts/spark-packs";
import { verifyBitsTransactionReceipt } from "../twitch/bits-receipt";

export interface ViewerWallet {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export interface WalletPurchase {
  sku: string;
  transactionId: string;
  transactionReceipt: string;
}

type WalletDurableObject = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

function configured(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized && !normalized.startsWith("replace_with_") ? normalized : "";
}

function configuredChannelId(channelId?: string): string {
  return configured(channelId) || configured(process.env.VAULT_SURGE_LOCAL_CHANNEL_ID) || "local-development";
}

async function durableWallet(channelId?: string): Promise<WalletDurableObject | undefined> {
  try {
    const workers = await import("cloudflare:workers");
    const bindings = workers.env as unknown as {
      VAULT_SURGE_COMMAND_QUEUE?: DurableObjectNamespace;
    };
    const namespace = bindings.VAULT_SURGE_COMMAND_QUEUE;
    if (!namespace) return undefined;
    return namespace.getByName(configuredChannelId(channelId)) as unknown as WalletDurableObject;
  } catch {
    return undefined;
  }
}

async function walletRequest<T>(
  action: string,
  channelId: string,
  body: unknown,
): Promise<T> {
  const durable = await durableWallet(channelId);
  if (!durable) throw new Error("Viewer wallet storage is unavailable.");
  const response = await durable.fetch(`https://vault-surge-command-queue.local/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Wallet ${action} failed.`);
  }
  return await response.json() as T;
}

function viewerId(claims: TwitchExtensionClaims): string {
  return claims.user_id ? twitchViewerId(claims.user_id) : claims.opaque_user_id;
}

export function twitchViewerId(userId: string): string {
  return `twitch:${userId}`;
}

export async function getViewerWallet(claims: TwitchExtensionClaims): Promise<ViewerWallet> {
  return walletRequest<ViewerWallet>("wallet", claims.channel_id, {
    viewerId: viewerId(claims),
  });
}

export async function creditSparkPurchase(
  claims: TwitchExtensionClaims,
  purchase: WalletPurchase,
): Promise<ViewerWallet> {
  const pack = sparkPackBySku.get(purchase.sku);
  if (!pack) throw new Error("Unknown Spark pack.");
  if (!purchase.transactionId.trim()) throw new Error("Bits transaction is missing.");
  if (!purchase.transactionReceipt.trim()) throw new Error("Bits transaction receipt is missing.");
  await verifyBitsTransactionReceipt(purchase.transactionReceipt, pack.sku, purchase.transactionId);
  return walletRequest<ViewerWallet>("wallet-credit", claims.channel_id, {
    viewerId: viewerId(claims),
    source: "bits",
    sku: pack.sku,
    transactionId: purchase.transactionId,
    amount: pack.sparks,
  });
}

export async function spendViewerSparks(
  claims: TwitchExtensionClaims,
  amount: number,
  commandId: string,
): Promise<ViewerWallet> {
  return walletRequest<ViewerWallet>("wallet-spend", claims.channel_id, {
    viewerId: viewerId(claims),
    amount,
    commandId,
  });
}

export async function refundViewerSparks(
  claims: TwitchExtensionClaims,
  amount: number,
  commandId: string,
): Promise<ViewerWallet> {
  return walletRequest<ViewerWallet>("wallet-credit", claims.channel_id, {
    viewerId: viewerId(claims),
    source: "refund",
    transactionId: `refund:${commandId}`,
    amount,
  });
}

export async function creditChannelPointSparks(
  channelId: string,
  userId: string,
  redemptionId: string,
  amount: number,
): Promise<ViewerWallet> {
  if (!redemptionId.trim()) throw new Error("Channel Point redemption id is missing.");
  return walletRequest<ViewerWallet>("wallet-credit", channelId, {
    viewerId: twitchViewerId(userId),
    source: "channel_points",
    transactionId: redemptionId,
    amount,
  });
}
