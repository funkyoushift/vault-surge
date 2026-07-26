import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import https from "node:https";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const extensionRoot = resolve(projectRoot, "extension-dist");
const certificatePath = resolve(projectRoot, ".certs", "localhost.pem");
const certificateKeyPath = resolve(projectRoot, ".certs", "localhost-key.pem");
const accessLogPath = resolve(projectRoot, "extension-access.log");
const port = 8081;

if (!existsSync(certificatePath) || !existsSync(certificateKeyPath)) {
  throw new Error("The trusted localhost certificate is missing.");
}
if (!existsSync(resolve(extensionRoot, "viewer.html"))) {
  throw new Error("The Twitch extension build is missing. Run npm run extension:build.");
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

const server = https.createServer({
  cert: readFileSync(certificatePath),
  key: readFileSync(certificateKeyPath),
}, (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "https://localhost").pathname);
  const accessLine = `${new Date().toISOString()} ${request.method || "GET"} ${pathname}`;
  console.log(`[Vault Surge Extension] ${accessLine}`);
  appendFileSync(accessLogPath, `${accessLine}\n`);
  const relativePath = pathname === "/" ? "viewer.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(extensionRoot, relativePath);
  const insideRoot = filePath === extensionRoot || filePath.startsWith(`${extensionRoot}${sep}`);

  if (!insideRoot || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end("Not found.");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(readFileSync(filePath));
});

server.listen(port, "localhost", () => {
  console.log(`[Vault Surge Extension] Static HTTPS component ready at https://localhost:${port}/`);
});
