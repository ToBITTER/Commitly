import test from "node:test";
import assert from "node:assert/strict";
import { buildInstructions, truncateDiff } from "../src/prompt.js";
import { DEFAULT_CONFIG } from "../src/config.js";

test("buildInstructions includes configured conventions", () => {
  const instructions = buildInstructions({
    ...DEFAULT_CONFIG,
    typesAllowed: ["feat", "fix"],
    maxLength: 60,
  });

  assert.match(instructions, /Allowed types: feat, fix\./);
  assert.match(instructions, /Maximum length: 60 characters\./);
});

test("truncateDiff keeps the start and end of oversized diffs", () => {
  const diff = "a".repeat(80) + "middle" + "z".repeat(80);
  const truncated = truncateDiff(diff, 60);

  assert.match(truncated, /^\w+/);
  assert.match(truncated, /\[\.\.\. diff truncated by Commitly \.\.\.\]/);
  assert.match(truncated, /z+$/);
});
