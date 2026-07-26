const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const TWITCH_HELIX_URL = "https://api.twitch.tv/helix";

export const broadcasterScopes = [
  "channel:manage:redemptions",
  "channel:read:subscriptions",
  "channel:read:hype_train",
  "moderator:read:followers",
] as const;

export const twitchSessionCookie = "vs_twitch_session";
export const twitchOAuthStateCookie = "vs_twitch_oauth_state";

export interface TwitchBroadcasterSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  broadcasterId: string;
  broadcasterLogin: string;
  scopes: string[];
}

interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

interface TwitchValidationResponse {
  client_id: string;
  login: string;
  scopes: string[];
  user_id: string;
  expires_in: number;
}

export interface TwitchServerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sessionSecret: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function configuredValue(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized && !normalized.startsWith("replace_with_") ? normalized : "";
}

export function getTwitchServerConfig(): TwitchServerConfig | null {
  const config = {
    clientId: configuredValue(process.env.TWITCH_CLIENT_ID),
    clientSecret: configuredValue(process.env.TWITCH_CLIENT_SECRET),
    redirectUri: configuredValue(process.env.TWITCH_REDIRECT_URI),
    sessionSecret: configuredValue(process.env.TWITCH_SESSION_SECRET),
  };
  return Object.values(config).every(Boolean) ? config : null;
}

export function isTwitchOAuthConfigured(): boolean {
  return getTwitchServerConfig() !== null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomToken(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function sessionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealTwitchSession(session: TwitchBroadcasterSession, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await sessionKey(secret),
    encoder.encode(JSON.stringify(session)),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function openTwitchSession(value: string, secret: string): Promise<TwitchBroadcasterSession | null> {
  try {
    const [ivPart, encryptedPart] = value.split(".");
    if (!ivPart || !encryptedPart) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivPart) },
      await sessionKey(secret),
      base64UrlToBytes(encryptedPart),
    );
    const parsed = JSON.parse(decoder.decode(decrypted)) as TwitchBroadcasterSession;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.broadcasterId || !Number.isFinite(parsed.expiresAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function serializeCookie(
  name: string,
  value: string,
  request: Request,
  options: { maxAge: number; path?: string },
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=${options.path ?? "/"}; HttpOnly; SameSite=Lax; Max-Age=${options.maxAge}${secure}`;
}

export function clearCookie(name: string, request: Request, path = "/"): string {
  return serializeCookie(name, "", request, { maxAge: 0, path });
}

export function createAuthorizationUrl(config: TwitchServerConfig, state: string): string {
  const url = new URL(TWITCH_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", broadcasterScopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function parseTwitchResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || `Twitch request failed with status ${response.status}.`);
  return data;
}

export async function exchangeAuthorizationCode(
  config: TwitchServerConfig,
  code: string,
): Promise<TwitchBroadcasterSession> {
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });
  const token = await parseTwitchResponse<TwitchTokenResponse>(response);
  return validateAndCreateSession(config, token);
}

async function validateAndCreateSession(
  config: TwitchServerConfig,
  token: TwitchTokenResponse,
): Promise<TwitchBroadcasterSession> {
  const validationResponse = await fetch(TWITCH_VALIDATE_URL, {
    headers: { Authorization: `OAuth ${token.access_token}` },
  });
  const validation = await parseTwitchResponse<TwitchValidationResponse>(validationResponse);
  if (validation.client_id !== config.clientId) throw new Error("Twitch returned a token for a different client.");
  const scopes = validation.scopes ?? token.scope ?? [];
  if (!broadcasterScopes.every((scope) => scopes.includes(scope))) {
    throw new Error("Twitch authorization did not include all required scopes.");
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + Math.max(0, validation.expires_in ?? token.expires_in) * 1000,
    broadcasterId: validation.user_id,
    broadcasterLogin: validation.login,
    scopes,
  };
}

export async function refreshBroadcasterSession(
  config: TwitchServerConfig,
  session: TwitchBroadcasterSession,
): Promise<TwitchBroadcasterSession> {
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  });
  return validateAndCreateSession(config, await parseTwitchResponse<TwitchTokenResponse>(response));
}

export async function getBroadcasterSession(request: Request): Promise<{
  session: TwitchBroadcasterSession | null;
  refreshedCookie?: string;
}> {
  const config = getTwitchServerConfig();
  if (!config) return { session: null };
  const sealed = readCookie(request, twitchSessionCookie);
  const session = sealed ? await openTwitchSession(sealed, config.sessionSecret) : null;
  if (!session) return { session: null };
  if (session.expiresAt - Date.now() > 5 * 60 * 1000) return { session };
  try {
    const refreshed = await refreshBroadcasterSession(config, session);
    const cookie = serializeCookie(
      twitchSessionCookie,
      await sealTwitchSession(refreshed, config.sessionSecret),
      request,
      { maxAge: 60 * 60 * 24 * 30 },
    );
    return { session: refreshed, refreshedCookie: cookie };
  } catch {
    return { session: null };
  }
}

export async function twitchHelixFetch<T>(
  session: TwitchBroadcasterSession,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = getTwitchServerConfig();
  if (!config) throw new Error("Twitch OAuth is not configured.");
  const response = await fetch(`${TWITCH_HELIX_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Client-Id": config.clientId,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  return parseTwitchResponse<T>(response);
}

export function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
