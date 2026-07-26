import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(projectRoot, ".vault-surge-worker.lock");
const mkcertRootPath = process.env.LOCALAPPDATA
  ? resolve(process.env.LOCALAPPDATA, "mkcert", "rootCA.pem")
  : "";
const terminalStatuses = new Set(["completed", "rejected", "failed", "cancelled", "refunded", "expired"]);
const dispatchableStatuses = new Set(["validated", "approved"]);

export function canonicalCommand(command) {
  return JSON.stringify({
    id: command.id,
    channelId: command.channelId,
    effectKey: command.effectKey,
    viewerId: command.viewerId,
    viewerParameters: command.viewerParameters,
    adapterParameters: command.adapterParameters,
    createdAt: command.createdAt,
    expiresAt: command.expiresAt,
    nonce: command.nonce,
  });
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function verifyCommandSignature(command, secret) {
  if (!secret || typeof command?.signature !== "string") return false;
  const expected = Buffer.from(base64Url(createHmac("sha256", secret).update(canonicalCommand(command)).digest()));
  const supplied = Buffer.from(command.signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function classifySdkFailure(message) {
  const value = String(message || "").toLowerCase();
  return /not found|not loaded|load into|no selected player|queue is full|temporar|try again/.test(value)
    ? "retryable"
    : "failed";
}

export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function requestJson(urlValue, options = {}, body) {
  const url = new URL(urlValue);
  const client = url.protocol === "https:" ? https : http;
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const usesLocalCertificate = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "::1";
  const certificatePath = mkcertRootPath && existsSync(mkcertRootPath)
    ? mkcertRootPath
    : resolve(projectRoot, ".certs", "localhost.pem");
  return new Promise((resolvePromise, reject) => {
    const request = client.request(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": String(payload.length) } : {}),
        ...(options.headers || {}),
      },
      timeout: options.timeout || 5000,
      ...(url.protocol === "https:" && usesLocalCertificate && existsSync(certificatePath)
        ? { ca: readFileSync(certificatePath) }
        : {}),
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data;
        try { data = text ? JSON.parse(text) : {} } catch { data = { error: text || "Invalid JSON response." } }
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(data.error || data.message || `HTTP ${response.statusCode}`));
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

function acquireWorkerLock() {
  try {
    const descriptor = openSync(lockPath, "wx");
    writeFileSync(descriptor, String(process.pid));
    return;
  } catch {
    try {
      const oldPid = Number(readFileSync(lockPath, "utf8"));
      process.kill(oldPid, 0);
      throw new Error(`Vault Surge companion worker is already running as PID ${oldPid}.`);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
      rmSync(lockPath, { force: true });
      const descriptor = openSync(lockPath, "wx");
      writeFileSync(descriptor, String(process.pid));
    }
  }
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function updateStatus(ebsUrl, headers, id, status, detail) {
  await requestJson(`${ebsUrl}/api/streamer/commands`, { method: "POST", headers }, { id, status, detail });
}

async function dispatchCommand(command, configuration) {
  const { ebsUrl, companionHeaders, sdkHeaders, signingSecret } = configuration;
  if (!verifyCommandSignature(command, signingSecret)) {
    await updateStatus(ebsUrl, companionHeaders, command.id, "failed", "Companion rejected an invalid command signature.");
    return;
  }
  if (Date.parse(command.expiresAt) <= Date.now()) return;
  await updateStatus(ebsUrl, companionHeaders, command.id, "dispatched", "Verified command sent to the BL4 SDK adapter.");
  let queued;
  try {
    queued = await requestJson("http://127.0.0.1:49775/v1/commands", {
      method: "POST",
      headers: sdkHeaders,
    }, {
      id: command.id,
      nonce: command.nonce.replace(/-/g, ""),
      effect_key: command.effectKey,
      expires_at: command.expiresAt,
      parameters: command.viewerParameters,
    });
  } catch (error) {
    await updateStatus(ebsUrl, companionHeaders, command.id, "retryable", `SDK dispatch failed: ${error.message}`);
    return;
  }
  if (!queued?.queued) {
    await updateStatus(ebsUrl, companionHeaders, command.id, "failed", "SDK adapter did not accept the command.");
    return;
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await sleep(250);
    try {
      const result = await requestJson(
        `http://127.0.0.1:49775/v1/commands/${encodeURIComponent(command.id)}`,
        { headers: sdkHeaders, timeout: 2500 },
      );
      if (result.ok) {
        await updateStatus(ebsUrl, companionHeaders, command.id, "completed", result.message || "Effect completed.");
      } else {
        const status = classifySdkFailure(result.message);
        await updateStatus(ebsUrl, companionHeaders, command.id, status, result.message || "SDK effect failed.");
      }
      return;
    } catch (error) {
      if (!/not found|HTTP 404/i.test(error.message)) throw error;
    }
  }
  await updateStatus(ebsUrl, companionHeaders, command.id, "retryable", "SDK result timed out.");
}

export async function main() {
  acquireWorkerLock();
  const env = parseEnv(readFileSync(resolve(projectRoot, ".env.local"), "utf8"));
  const companionToken = env.STREAMER_COMPANION_TOKEN?.trim();
  const signingSecret = env.COMMAND_SIGNING_SECRET?.trim();
  if (!companionToken || !signingSecret) throw new Error("Companion token or command signing secret is missing.");
  const ebsUrl = (env.VITE_EXTENSION_EBS_URL || "https://localhost:3000").replace(/\/+$/, "");
  const configuration = {
    ebsUrl,
    signingSecret,
    companionHeaders: { Authorization: `Bearer ${companionToken}` },
    sdkHeaders: { "X-Vault-Surge-Token": companionToken },
  };
  const inFlight = new Set();
  console.log("[Vault Surge Worker] Connected queue runner started.");
  try {
    while (true) {
      try {
        const data = await requestJson(`${ebsUrl}/api/streamer/commands`, {
          headers: configuration.companionHeaders,
          timeout: 4000,
        });
        if (!data.state?.sessionActive || data.state?.paused) {
          await sleep(750);
          continue;
        }
        for (const command of data.commands || []) {
          if (terminalStatuses.has(command.status) || !dispatchableStatuses.has(command.status) || inFlight.has(command.id)) continue;
          inFlight.add(command.id);
          void dispatchCommand(command, configuration)
            .catch((error) => console.error(`[Vault Surge Worker] ${command.id}: ${error.message}`))
            .finally(() => inFlight.delete(command.id));
        }
      } catch (error) {
        console.error(`[Vault Surge Worker] Poll failed: ${error.message}`);
      }
      await sleep(750);
    }
  } finally {
    rmSync(lockPath, { force: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`[Vault Surge Worker] Fatal: ${error.stack || error.message}`);
    rmSync(lockPath, { force: true });
    process.exitCode = 1;
  });
}
