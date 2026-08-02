import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/config.js";
import { cleanCommitMessage, generateOllamaCommitMessage } from "../src/ollama.js";

test("cleanCommitMessage extracts an Ollama conventional commit response", () => {
  const message = cleanCommitMessage(
    "Sure:\n\nfeat(cli): add ollama generation\n\nDone.",
    DEFAULT_CONFIG,
  );

  assert.equal(message, "feat(cli): add ollama generation");
});

test("generateOllamaCommitMessage calls the local Ollama chat API", async (context) => {
  const originalFetch = globalThis.fetch;

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);

    assert.equal(String(url), "http://localhost:11434/api/chat");
    assert.equal(payload.model, "qwen2.5-coder:1.5b");
    assert.equal(payload.stream, false);
    assert.equal(payload.messages[0].role, "system");
    assert.equal(payload.messages[1].role, "user");

    return new Response(
      JSON.stringify({
        message: {
          content: "feat(cli): add ollama generation",
        },
      }),
      { status: 200 },
    );
  };

  const message = await generateOllamaCommitMessage({
    diff: "diff --git a/src/cli.js b/src/cli.js\n+hello",
    config: DEFAULT_CONFIG,
  });

  assert.equal(message, "feat(cli): add ollama generation");
});
