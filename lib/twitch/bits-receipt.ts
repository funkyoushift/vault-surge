import { sparkPackBySku } from "../contracts/spark-packs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface BitsReceiptPayload {
  topic?: string;
  exp?: number | string;
  expires?: number | string;
  data?: {
    transactionId?: string;
    userId?: string;
    product?: {
      sku?: string;
      cost?: {
        amount?: number | string;
        type?: string;
      };
    };
  };
}

function configuredValue(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized && !normalized.startsWith("replace_with_") ? normalized : "";
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeJson<T>(part: string): T {
  return JSON.parse(decoder.decode(base64ToBytes(part))) as T;
}

function safeBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function verifyBitsTransactionReceipt(
  receipt: string,
  expectedSku: string,
  expectedTransactionId: string,
): Promise<void> {
  const pack = sparkPackBySku.get(expectedSku);
  if (!pack) throw new Error("Unknown Spark pack.");
  const encodedSecret = configuredValue(process.env.TWITCH_EXTENSION_SECRET);
  if (!encodedSecret) throw new Error("Twitch Extension verification is not configured.");

  const parts = receipt.split(".");
  if (parts.length !== 3) throw new Error("Malformed Bits transaction receipt.");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson<{ alg?: string }>(headerPart);
  if (header.alg !== "HS256") throw new Error("Unsupported Bits receipt algorithm.");

  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(encodedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerPart}.${payloadPart}`)));
  if (!safeBytesEqual(expected, base64ToBytes(signaturePart))) throw new Error("Invalid Bits receipt signature.");

  const payload = decodeJson<BitsReceiptPayload>(payloadPart);
  const expiration = Number(payload.exp ?? payload.expires ?? 0);
  if (!Number.isFinite(expiration) || expiration <= Math.floor(Date.now() / 1000)) {
    throw new Error("Expired Bits transaction receipt.");
  }
  if (payload.topic !== "bits_transaction_receipt") throw new Error("Unexpected Bits receipt topic.");
  if (payload.data?.transactionId !== expectedTransactionId) throw new Error("Bits transaction id mismatch.");
  if (payload.data?.product?.sku !== expectedSku) throw new Error("Bits product SKU mismatch.");
  if (String(payload.data?.product?.cost?.amount ?? "") !== String(pack.bitsCost)) {
    throw new Error("Bits product cost mismatch.");
  }
  if (payload.data?.product?.cost?.type && payload.data.product.cost.type !== "bits") {
    throw new Error("Bits receipt currency mismatch.");
  }
}
