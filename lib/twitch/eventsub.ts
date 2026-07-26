const encoder = new TextEncoder();

function configuredSecret(): string {
  const value = process.env.TWITCH_EVENTSUB_SECRET?.trim() ?? "";
  return value && !value.startsWith("replace_with_") ? value : "";
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export interface TwitchEventSubHeaders {
  messageId: string;
  messageTimestamp: string;
  messageSignature: string;
  messageType: string;
}

export function readEventSubHeaders(headers: Headers): TwitchEventSubHeaders {
  return {
    messageId: headers.get("Twitch-Eventsub-Message-Id") ?? "",
    messageTimestamp: headers.get("Twitch-Eventsub-Message-Timestamp") ?? "",
    messageSignature: headers.get("Twitch-Eventsub-Message-Signature") ?? "",
    messageType: headers.get("Twitch-Eventsub-Message-Type") ?? "",
  };
}

export async function verifyEventSubRequest(headers: TwitchEventSubHeaders, rawBody: string): Promise<void> {
  const secret = configuredSecret();
  if (!secret) throw new Error("Twitch EventSub verification is not configured.");
  if (!headers.messageId || !headers.messageTimestamp || !headers.messageSignature) {
    throw new Error("Missing EventSub signature headers.");
  }
  const timestamp = Date.parse(headers.messageTimestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
    throw new Error("EventSub message timestamp is outside the replay window.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${headers.messageId}${headers.messageTimestamp}${rawBody}`),
  ));
  const expected = `sha256=${bytesToHex(signature)}`;
  if (!safeEqual(expected, headers.messageSignature)) throw new Error("Invalid EventSub signature.");
}
