import test from "node:test";
import assert from "node:assert/strict";
import { cleanCommitMessage } from "../src/llm.js";
import { DEFAULT_CONFIG } from "../src/config.js";

test("cleanCommitMessage extracts a conventional commit from model chatter", () => {
  const message = cleanCommitMessage(
    "Here is a good one:\n\nfeat(cli): parse staged git diff\n\nHope that helps.",
    DEFAULT_CONFIG,
  );

  assert.equal(message, "feat(cli): parse staged git diff");
});

test("cleanCommitMessage coerces unsupported types to the first allowed type", () => {
  const message = cleanCommitMessage("improve(cli): make prompts clearer", {
    ...DEFAULT_CONFIG,
    typesAllowed: ["chore", "fix"],
  });

  assert.equal(message, "chore(cli): make prompts clearer");
});

test("cleanCommitMessage enforces max length", () => {
  const message = cleanCommitMessage("feat: add a very polished interactive prompt flow", {
    ...DEFAULT_CONFIG,
    maxLength: 24,
  });

  assert.equal(message.length <= 24, true);
  assert.equal(message, "feat: add a very");
});
