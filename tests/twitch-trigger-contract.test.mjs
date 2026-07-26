import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Twitch automatic trigger definitions use current EventSub versions and safe defaults", async () => {
  const source = await readFile(
    new URL("../lib/contracts/twitch-event-triggers.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /eventSubType:\s*"channel\.follow"[\s\S]*?eventSubVersion:\s*"2"/);
  assert.match(source, /eventSubType:\s*"channel\.subscribe"[\s\S]*?eventSubVersion:\s*"1"/);
  assert.match(source, /eventSubType:\s*"channel\.raid"[\s\S]*?eventSubVersion:\s*"1"/);
  assert.match(source, /eventSubType:\s*"channel\.hype_train\.begin"[\s\S]*?eventSubVersion:\s*"2"/);
  assert.equal((source.match(/enabled:\s*false/g) ?? []).length, 4);
  assert.match(source, /cooldownSeconds/);
  assert.match(source, /maxUsesPerStream/);
});

test("OAuth requests follower, subscription, and Hype Train scopes", async () => {
  const source = await readFile(
    new URL("../lib/twitch/server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /moderator:read:followers/);
  assert.match(source, /channel:read:subscriptions/);
  assert.match(source, /channel:read:hype_train/);
});
