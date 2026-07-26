export type TwitchExtensionRole = "viewer" | "moderator" | "broadcaster";

export interface TwitchExtensionClaims {
  channel_id: string;
  exp: number;
  opaque_user_id: string;
  role: TwitchExtensionRole | "external";
  is_unlinked?: boolean | string;
  user_id?: string;
  pubsub_perms?: { listen?: string[]; send?: string[] };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

export async function verifyTwitchExtensionJwt(token: string): Promise<TwitchExtensionClaims> {
  const encodedSecret = configuredValue(process.env.TWITCH_EXTENSION_SECRET);
  if (!encodedSecret) throw new Error("Twitch Extension verification is not configured.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed Extension JWT.");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson<{ alg?: string; typ?: string }>(headerPart);
  if (header.alg !== "HS256") throw new Error("Unsupported Extension JWT algorithm.");
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(encodedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerPart}.${payloadPart}`)));
  if (!safeBytesEqual(expected, base64ToBytes(signaturePart))) throw new Error("Invalid Extension JWT signature.");

  const claims = decodeJson<TwitchExtensionClaims>(payloadPart);
  if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired Extension JWT.");
  if (!claims.channel_id || !claims.opaque_user_id) throw new Error("Extension JWT is missing identity claims.");
  if (!["viewer", "moderator", "broadcaster"].includes(claims.role)) throw new Error("Extension JWT role is not permitted.");
  return claims;
}

export function extensionIdentity(claims: TwitchExtensionClaims) {
  const isUnlinked = claims.is_unlinked === true || claims.is_unlinked === "true";
  return {
    channelId: claims.channel_id,
    opaqueUserId: claims.opaque_user_id,
    userId: isUnlinked ? null : claims.user_id ?? null,
    role: claims.role as TwitchExtensionRole,
    linked: !isUnlinked && Boolean(claims.user_id),
    stable: claims.opaque_user_id.startsWith("U"),
  };
}
