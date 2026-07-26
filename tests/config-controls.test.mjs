import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("broadcaster defaults approval off and provides column-wide controls", async () => {
  const [configSource, shellSource] = await Promise.all([
    readFile(new URL("../components/broadcaster-config.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/prototype-shell.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(configSource, /requiresApproval:\s*false/);
  assert.match(configSource, /label="Enabled".*setBooleanColumn\("enabled", true\)/s);
  assert.match(configSource, /label="Channel Points".*setBooleanColumn\("channelPointsEligible", true\)/s);
  assert.match(configSource, /label="Approval".*setBooleanColumn\("requiresApproval", true\)/s);
  assert.match(shellSource, /vault-surge-settings-v3/);
});

test("Live Test renders and sends effect-specific parameters", async () => {
  const [dashboardSource, shellSource] = await Promise.all([
    readFile(new URL("../components/session-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/prototype-shell.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(dashboardSource, /testEffect\?\.inputs/);
  assert.match(dashboardSource, /onTestParameterChange/);
  assert.match(shellSource, /createCommand\(testEffect, testParameters\)/);
});
