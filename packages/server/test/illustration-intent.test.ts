import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRetryIllustrationIntent } from "../src/services/image/illustration-intent.js";

test("automatic illustrator retry skips when the agent declines generation", () => {
  const result = resolveRetryIllustrationIntent({
    illData: { shouldGenerate: false, prompt: "A quiet tavern scene" },
    forceIllustrate: false,
    anchorMessageContent: "The party entered the tavern.",
  });

  assert.equal(result, null);
});

test("manual illustrate proceeds when the agent declines but still returns a prompt", () => {
  const result = resolveRetryIllustrationIntent({
    illData: { shouldGenerate: false, prompt: "A quiet tavern scene" },
    forceIllustrate: true,
    anchorMessageContent: "The party entered the tavern.",
  });

  assert.deepEqual(result, { proceed: true, prompt: "A quiet tavern scene" });
});

test("manual illustrate builds a fallback prompt from the anchored assistant message", () => {
  const result = resolveRetryIllustrationIntent({
    illData: { shouldGenerate: false, prompt: "" },
    forceIllustrate: true,
    anchorMessageContent: "The knight drew his sword beneath the storm-lit battlements.",
  });

  assert.ok(result?.proceed);
  assert.match(result!.prompt, /knight drew his sword/i);
});
