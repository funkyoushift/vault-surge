const localExtensionOrigin = "https://localhost:8081";

function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.TWITCH_EXTENSION_ALLOWED_ORIGINS ?? localExtensionOrigin)
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function extensionCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type, X-Extension-JWT",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function extensionOptions(request: Request): Response {
  const origin = request.headers.get("origin") ?? "";
  if (origin && !allowedOrigins().has(origin)) {
    return new Response(null, { status: 403, headers: extensionCorsHeaders(request) });
  }
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request) });
}
