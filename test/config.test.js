import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";

test("loadConfig returns defaults without a config file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "commitly-config-"));

  try {
    const config = await loadConfig({ cwd: directory });
    assert.deepEqual(config.typesAllowed, DEFAULT_CONFIG.typesAllowed);
    assert.equal(config.maxLength, DEFAULT_CONFIG.maxLength);
    assert.equal(config.maxDiffChars, DEFAULT_CONFIG.maxDiffChars);
    assert.equal(config.model, DEFAULT_CONFIG.model);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("loadConfig reads .commitlyrc from the working tree", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "commitly-config-"));

  try {
    await writeFile(
      path.join(directory, ".commitlyrc"),
      JSON.stringify({
        typesAllowed: ["feat", "fix"],
        maxLength: 50,
        maxDiffChars: 2000,
        model: "llama3.2",
      }),
    );

    const config = await loadConfig({ cwd: directory });
    assert.deepEqual(config.typesAllowed, ["feat", "fix"]);
    assert.equal(config.maxLength, 50);
    assert.equal(config.maxDiffChars, 2000);
    assert.equal(config.model, "llama3.2");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("loadConfig allows a CLI model override", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "commitly-config-"));

  try {
    const config = await loadConfig({ cwd: directory, modelOverride: "qwen2.5-coder:0.5b" });
    assert.equal(config.model, "qwen2.5-coder:0.5b");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
