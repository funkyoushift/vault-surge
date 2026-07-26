import { existsSync, readFileSync } from "node:fs";
import https from "node:https";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mkcertRootPath = process.env.LOCALAPPDATA
  ? resolve(process.env.LOCALAPPDATA, "mkcert", "rootCA.pem")
  : "";
const certificatePath = mkcertRootPath && existsSync(mkcertRootPath)
  ? mkcertRootPath
  : resolve(projectRoot, ".certs", "localhost.pem");
const effectKey = process.argv[2] || "heal_player";

function requestJson(path, method = "GET", body) {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolvePromise, reject) => {
    const request = https.request({
      hostname: "localhost",
      port: 3000,
      path,
      method,
      ca: existsSync(certificatePath) ? readFileSync(certificatePath) : undefined,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": String(payload.length),
      } : {},
      timeout: 5000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(data.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolvePromise(data);
      });
    });
    request.on("timeout", () => request.destroy(new Error("Request timed out.")));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

const initial = await requestJson("/api/local/commands");
if (!initial.sdk?.started || !initial.sdk?.paired) throw new Error("BL4 SDK adapter is not connected.");
if (!initial.state?.sessionActive || initial.state?.paused) throw new Error("Streamer session is not accepting commands.");

const created = await requestJson("/api/local/commands", "POST", {
  action: "test",
  effectKey,
});
const commandId = created.command?.id;
if (!commandId) throw new Error("Local EBS did not create a command.");

if (created.command.status === "queued") {
  throw new Error("Live test unexpectedly requested streamer approval.");
}

const terminal = new Set(["completed", "failed", "retryable", "rejected", "expired", "cancelled"]);
const deadline = Date.now() + 25_000;
let command = created.command;
while (Date.now() < deadline) {
  await sleep(400);
  const state = await requestJson("/api/local/commands");
  command = (state.commands || []).find((item) => item.id === commandId);
  if (command && terminal.has(command.status)) break;
}

if (!command || !terminal.has(command.status)) throw new Error("Pipeline command did not finish within 25 seconds.");
console.log(JSON.stringify({
  id: command.id,
  effectKey: command.effectKey,
  status: command.status,
  detail: command.statusDetail,
}, null, 2));
if (command.status !== "completed") process.exitCode = 1;
