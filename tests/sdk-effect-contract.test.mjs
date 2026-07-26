import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function catalogStates(source) {
  const states = new Map();
  let currentKey = null;
  for (const line of source.split(/\r?\n/)) {
    const key = line.match(/key:\s*"([^"]+)".*displayName/);
    if (key) currentKey = key[1];
    const enabled = line.match(/enabled:\s*(true|false)/);
    if (currentKey && enabled) {
      states.set(currentKey, enabled[1] === "true");
      currentKey = null;
    }
  }
  return states;
}

function enabledApprovalStates(source) {
  const states = [];
  let currentKey = null;
  for (const line of source.split(/\r?\n/)) {
    const key = line.match(/key:\s*"([^"]+)".*displayName/);
    if (key) currentKey = key[1];
    const state = line.match(/requiresApproval:\s*(true|false),\s*enabled:\s*(true|false)/);
    if (currentKey && state) {
      states.push({
        key: currentKey,
        requiresApproval: state[1] === "true",
        enabled: state[2] === "true",
      });
      currentKey = null;
    }
  }
  return states;
}

function supportedEffects(source) {
  const list = source.match(/def supported_effects\(\).*?return \[(.*?)\n\s*\]/s);
  assert.ok(list, "SDK supported_effects allowlist is present");
  return new Set([...list[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

test("every enabled viewer effect has an SDK allowlist entry", async () => {
  const [catalogSource, sdkSource] = await Promise.all([
    readFile(new URL("../lib/contracts/effects.ts", import.meta.url), "utf8"),
    readFile(new URL("../sdk-mod/VaultSurge/effects.py", import.meta.url), "utf8"),
  ]);
  const supported = supportedEffects(sdkSource);
  const missing = [...catalogStates(catalogSource)]
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .filter((key) => !supported.has(key));
  assert.deepEqual(missing, []);
});

test("known unsafe or unimplemented effects stay disabled", async () => {
  const catalogSource = await readFile(
    new URL("../lib/contracts/effects.ts", import.meta.url),
    "utf8",
  );
  const states = catalogStates(catalogSource);
  assert.equal(states.get("launch_player"), false);
  assert.equal(states.get("freeze_world"), true);
  assert.equal(states.get("spawn_item"), true);
  assert.equal(states.get("heal_player"), false);
  assert.equal(states.get("disable_jumping"), false);
  assert.equal(states.get("kill_all_enemies"), false);
  assert.equal(states.get("delete_ground_items"), true);
});

test("viewer-enabled effects dispatch automatically", async () => {
  const catalogSource = await readFile(
    new URL("../lib/contracts/effects.ts", import.meta.url),
    "utf8",
  );
  const unexpectedApprovals = enabledApprovalStates(catalogSource)
    .filter((effect) => effect.enabled && effect.requiresApproval)
    .map((effect) => effect.key);
  assert.deepEqual(unexpectedApprovals, []);
});

test("local live tests may exercise disabled and restricted catalog entries", async () => {
  const [queueSource, shellSource] = await Promise.all([
    readFile(new URL("../lib/backend/command-queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/prototype-shell.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(queueSource, /allowDisabled:\s*true/);
  assert.match(queueSource, /allowRestricted:\s*true/);
  assert.doesNotMatch(shellSource, /if \(!effect\.enabled \|\| !sessionActive \|\| paused\) return/);
});

test("SDK targets the host and uses only the allowlisted mystery pool", async () => {
  const sdkSource = await readFile(
    new URL("../sdk-mod/VaultSurge/effects.py", import.meta.url),
    "utf8",
  );
  assert.match(sdkSource, /backend\.set_target_player\("0"\)/);
  assert.match(
    sdkSource,
    /spawn_itempool\("ItemPool_Trait_Loot_Guns", 1, 60\)/,
  );
  assert.match(sdkSource, /movement_delete_ground_items\(\)/);
  assert.match(sdkSource, /"spawn_open_golden_chest"/);
  assert.match(sdkSource, /"Char_UberLeaderP", "Char_UberBigBoss"/);
  assert.doesNotMatch(sdkSource, /"badass_savagehorn": "Char_BeastBadass"/);
  assert.match(sdkSource, /"brute_squad": \("Char_BruteBasic",\) \* 4/);
  assert.match(sdkSource, /"loot_mangler": "Char_CatLoot"/);
  assert.match(sdkSource, /"dev_ai_name": "IO_DestructibleBarrier_1000x500"/);
});
