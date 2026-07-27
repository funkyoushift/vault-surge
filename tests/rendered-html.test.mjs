import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function requestApp(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const { headers = {}, ...requestInit } = init;
  return worker.fetch(
    new Request(new URL(path, "http://localhost/"), {
      ...requestInit,
      headers: { accept: "text/html", ...headers },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders only the local streamer companion", async () => {
  const response = await requestApp();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Vault Surge . Streamer Companion<\/title>/i);
  assert.match(html, /VAULT\/\/SURGE/);
  assert.match(html, /STREAMER COMPANION/);
  assert.match(html, /Save settings/);
  assert.match(html, /Health Drop/);
  assert.doesNotMatch(html, /Make the mayhem yours|Simulated viewer|twitch-ext\.min\.js/);
});

test("Twitch setup and session paths remain focused", async () => {
  const configResponse = await requestApp("/config");
  const configHtml = await configResponse.text();
  assert.match(configHtml, /Finish setup on your PC/);
  assert.match(configHtml, /Oak2 Mod Manager releases/);
  assert.doesNotMatch(configHtml, /Save settings|Make the mayhem yours/);

  const sessionResponse = await requestApp("/live");
  const sessionHtml = await sessionResponse.text();
  assert.match(sessionHtml, /Session dashboard/);
  assert.doesNotMatch(sessionHtml, /aria-label="Streamer companion sections"/);

  const removedViewer = await requestApp("/viewer");
  assert.equal(removedViewer.status, 404);
});

test("builds a static Twitch viewer with helper registered before application code", async () => {
  const html = await readFile(new URL("../extension-dist/viewer.html", import.meta.url), "utf8");
  const helperPosition = html.indexOf("twitch-ext.min.js");
  const bootstrapPosition = html.indexOf("twitch-bootstrap.js");
  const applicationPosition = html.indexOf('src="./viewer.js"');
  assert.ok(helperPosition >= 0);
  assert.ok(bootstrapPosition > helperPosition);
  assert.ok(applicationPosition > bootstrapPosition);
  assert.doesNotMatch(html, /type="module"/);
  assert.match(html, /data-surface="component"/);
  assert.match(html, /Loading viewer controls/);
});

test("Config view loads Twitch's required Extension Helper", async () => {
  const html = await readFile(new URL("../extension-dist/config.html", import.meta.url), "utf8");
  assert.match(html, /extension-files\.twitch\.tv\/helper\/v1\/twitch-ext\.min\.js/);
  assert.match(html, /Use the Vault Surge app/);
});

test("viewer bundle contains safe controls without adapter internals", async () => {
  const bundle = await readFile(new URL("../extension-dist/viewer.js", import.meta.url), "utf8");
  assert.match(bundle, /Choose the chaos/);
  assert.match(bundle, /api\/twitch\/extension\/catalog/);
  assert.match(bundle, /api\/twitch\/extension\/commands/);
  assert.doesNotMatch(bundle, /adapterParameters|hookNote|Char_[A-Za-z0-9_]+|ASD_barrellogo|COMMAND_SIGNING_SECRET/);
});

test("public catalog projection strips disabled effects and adapter fields", async () => {
  const source = await readFile(new URL("../lib/contracts/public-effects.ts", import.meta.url), "utf8");
  assert.match(source, /!effect\.enabled \|\| effect\.riskLevel === "restricted"/);
  assert.doesNotMatch(source, /adapterParameters: effect\.adapterParameters|hookNote: effect\.hookNote/);
});

test("reports Twitch as unconfigured without exposing placeholders", async () => {
  const response = await requestApp("/api/twitch/status", { headers: { accept: "application/json" } });
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.configured, false);
  assert.equal(status.connected, false);
  assert.equal(status.broadcaster, null);
});

test("refuses OAuth, catalog, and command requests before credentials are configured", async () => {
  const oauth = await requestApp("/api/twitch/oauth/start", { headers: { accept: "application/json" } });
  assert.equal(oauth.status, 503);

  for (const [path, method] of [
    ["/api/twitch/extension/session", "POST"],
    ["/api/twitch/extension/catalog", "GET"],
    ["/api/twitch/extension/commands", "POST"],
  ]) {
    const response = await requestApp(path, {
      method,
      headers: { "x-extension-jwt": "not-a-valid-token", accept: "application/json" },
      body: method === "POST" ? JSON.stringify({ effectKey: "heal_player" }) : undefined,
    });
    assert.equal(response.status, 503);
  }
});

test("local Extension CORS accepts only the configured origin", async () => {
  const accepted = await requestApp("/api/twitch/extension/catalog", {
    method: "OPTIONS",
    headers: { origin: "https://localhost:8081" },
  });
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get("access-control-allow-origin"), "https://localhost:8081");

  const rejected = await requestApp("/api/twitch/extension/catalog", {
    method: "OPTIONS",
    headers: { origin: "https://untrusted.example" },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("does not accept unsigned EventSub or unauthenticated companion traffic", async () => {
  const eventSub = await requestApp("/api/twitch/eventsub", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ subscription: {}, event: {} }),
  });
  assert.equal(eventSub.status, 503);

  const companion = await requestApp("/api/streamer/commands", {
    headers: { accept: "application/json" },
  });
  assert.equal(companion.status, 401);
});

test("ships a double-click Windows companion launcher", async () => {
  const launcher = await readFile(new URL("../Launch Vault Surge.cmd", import.meta.url), "utf8");
  const startScript = await readFile(new URL("../scripts/start-companion.ps1", import.meta.url), "utf8");
  assert.match(launcher, /start-companion\.ps1/i);
  assert.match(startScript, /Get-NetTCPConnection/);
  assert.match(startScript, /npm\.cmd run dev/);
  assert.match(startScript, /https:\/\/localhost:3000\//);
});
