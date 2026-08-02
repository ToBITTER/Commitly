import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/config.js";
import { generateOfflineCommitMessage, parseDiffSummary } from "../src/offline.js";

const NEW_FILE_DIFF = `diff --git a/test.txt b/test.txt
new file mode 100644
index 0000000..ce01362
--- /dev/null
+++ b/test.txt
@@ -0,0 +1 @@
+hello commitly`;

test("parseDiffSummary counts staged file additions", () => {
  const summary = parseDiffSummary(NEW_FILE_DIFF);

  assert.equal(summary.files.length, 1);
  assert.equal(summary.files[0].path, "test.txt");
  assert.equal(summary.files[0].additions, 1);
  assert.equal(summary.files[0].isNew, true);
});

test("generateOfflineCommitMessage creates a conventional commit", () => {
  const message = generateOfflineCommitMessage({
    diff: NEW_FILE_DIFF,
    config: DEFAULT_CONFIG,
  });

  assert.equal(message, "feat(test): add test");
});

test("generateOfflineCommitMessage recognizes documentation changes", () => {
  const diff = `diff --git a/README.md b/README.md
index 1234567..890abcd 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
 # Commitly
+Usage docs`;

  const message = generateOfflineCommitMessage({
    diff,
    config: DEFAULT_CONFIG,
  });

  assert.equal(message, "docs(readme): update readme");
});
