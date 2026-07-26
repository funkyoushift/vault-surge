import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  canonicalCommand,
  classifySdkFailure,
  parseEnv,
  verifyCommandSignature,
} from "../scripts/companion-worker.mjs";

function sign(command, secret) {
  return createHmac("sha256", secret)
    .update(canonicalCommand(command))
    .digest("base64url");
}

test("verifies the exact server command envelope and rejects tampering", () => {
  const secret = "test-signing-secret-with-at-least-32-characters";
  const command = {
    id: "1da8e874-d324-4bcb-b2dd-c6e7ad9c065f",
    channelId: "1234",
    effectKey: "heal_player",
    viewerId: "U_TEST",
    viewerParameters: {},
    adapterParameters: { action: "spawn_recovery_pickup", pickup: "health", count: 1 },
    createdAt: "2026-07-26T08:00:00.000Z",
    expiresAt: "2026-07-26T08:02:00.000Z",
    nonce: "84cb0e23-42f3-4fc6-bda8-c237f1b3f872",
  };
  const signed = { ...command, signature: sign(command, secret) };
  assert.equal(verifyCommandSignature(signed, secret), true);
  assert.equal(verifyCommandSignature({ ...signed, effectKey: "kill_all_enemies" }, secret), false);
  assert.equal(verifyCommandSignature({ ...signed, viewerParameters: { message: "tampered" } }, secret), false);
});

test("parses local env values without exposing comments or quotes", () => {
  assert.deepEqual(
    parseEnv("# ignored\nA=one\nB=\"two words\"\nC='three'\n"),
    { A: "one", B: "two words", C: "three" },
  );
});

test("classifies temporarily unavailable game state as retryable", () => {
  assert.equal(classifySdkFailure("No selected player."), "retryable");
  assert.equal(classifySdkFailure("Load into a world and try again."), "retryable");
  assert.equal(classifySdkFailure("Unsupported effect key."), "failed");
});
