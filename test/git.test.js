import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import { EmptyDiffError } from "../src/errors.js";
import { getStagedDiff } from "../src/git.js";

const execFileAsync = promisify(execFile);

test("getStagedDiff reads staged changes from a real git repo", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "commitly-git-"));

  try {
    await execFileAsync("git", ["init"], { cwd: directory });
    await writeFile(path.join(directory, "note.txt"), "hello\n");
    await execFileAsync("git", ["add", "note.txt"], { cwd: directory });

    const diff = await getStagedDiff({ cwd: directory });
    assert.match(diff, /diff --git/);
    assert.match(diff, /\+hello/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("getStagedDiff fails clearly when nothing is staged", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "commitly-git-"));

  try {
    await execFileAsync("git", ["init"], { cwd: directory });
    await assert.rejects(() => getStagedDiff({ cwd: directory }), EmptyDiffError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
