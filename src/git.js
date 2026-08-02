import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommitlyError, EmptyDiffError } from "./errors.js";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 20 * 1024 * 1024;

export async function getStagedDiff({ cwd = process.cwd() } = {}) {
  try {
    await ensureGitWorkTree(cwd);

    const { stdout } = await execFileAsync("git", ["diff", "--cached", "--no-ext-diff"], {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    });
    const diff = stdout.trimEnd();

    if (!diff.trim()) {
      throw new EmptyDiffError();
    }

    return diff;
  } catch (error) {
    if (error instanceof CommitlyError) {
      throw error;
    }

    throw normalizeGitError(error, "read staged diff");
  }
}

async function ensureGitWorkTree(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    });

    if (stdout.trim() !== "true") {
      throw new CommitlyError("Commitly must be run inside a Git repository.");
    }
  } catch (error) {
    if (error instanceof CommitlyError) {
      throw error;
    }

    throw normalizeGitError(error, "check git repository");
  }
}

export async function commitStagedChanges({ cwd = process.cwd(), message }) {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["commit", "-m", message], {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    });

    return `${stdout}${stderr}`;
  } catch (error) {
    throw normalizeGitError(error, "create git commit");
  }
}

function normalizeGitError(error, action) {
  if (error.code === "ENOENT") {
    return new CommitlyError("Git is not installed or is not available on your PATH.", {
      cause: error,
    });
  }

  if (error.code === "EPERM") {
    return new CommitlyError("Git could not be started because permission was denied.", {
      cause: error,
    });
  }

  const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
  const message = stderr || error.message || `Could not ${action}.`;

  if (/not a git repository/i.test(message)) {
    return new CommitlyError("Commitly must be run inside a Git repository.", {
      cause: error,
    });
  }

  return new CommitlyError(`Could not ${action}: ${message}`, {
    cause: error,
  });
}
