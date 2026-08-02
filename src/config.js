import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { CommitlyError } from "./errors.js";

export const DEFAULT_CONFIG = Object.freeze({
  typesAllowed: [
    "feat",
    "fix",
    "docs",
    "style",
    "refactor",
    "perf",
    "test",
    "build",
    "ci",
    "chore",
    "revert",
  ],
  maxLength: 72,
  maxDiffChars: 12000,
  model: "gpt-5.6-luna",
  reasoningEffort: "none",
});

export async function loadConfig({
  cwd = process.cwd(),
  configPath,
  modelOverride,
} = {}) {
  const discoveredPath = await resolveConfigPath({ cwd, configPath });
  const fileConfig = discoveredPath ? await readConfigFile(discoveredPath) : {};
  const merged = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    model: modelOverride || process.env.COMMITLY_MODEL || fileConfig.model || DEFAULT_CONFIG.model,
  };

  return validateConfig(merged, discoveredPath);
}

async function resolveConfigPath({ cwd, configPath }) {
  if (configPath) {
    const resolved = path.isAbsolute(configPath) ? configPath : path.resolve(cwd, configPath);
    await assertReadableConfig(resolved);
    return resolved;
  }

  let current = cwd;

  while (true) {
    const candidate = path.join(current, ".commitlyrc");
    if (await exists(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function readConfigFile(configPath) {
  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CommitlyError(`Invalid JSON in ${configPath}.`);
    }

    throw new CommitlyError(`Could not read config file at ${configPath}.`, {
      cause: error,
    });
  }
}

async function assertReadableConfig(configPath) {
  try {
    await access(configPath);
  } catch (error) {
    throw new CommitlyError(`Config file not found at ${configPath}.`, {
      cause: error,
    });
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function validateConfig(config, configPath) {
  const source = configPath || "default config";

  if (!Array.isArray(config.typesAllowed) || config.typesAllowed.length === 0) {
    throw new CommitlyError(`${source}: typesAllowed must be a non-empty array.`);
  }

  const typesAllowed = config.typesAllowed.map((type) => {
    if (typeof type !== "string" || !/^[a-z]+$/.test(type)) {
      throw new CommitlyError(`${source}: commit types must be lowercase words.`);
    }
    return type;
  });

  if (!Number.isInteger(config.maxLength) || config.maxLength < 20 || config.maxLength > 200) {
    throw new CommitlyError(`${source}: maxLength must be an integer from 20 to 200.`);
  }

  if (
    !Number.isInteger(config.maxDiffChars) ||
    config.maxDiffChars < 1000 ||
    config.maxDiffChars > 200000
  ) {
    throw new CommitlyError(`${source}: maxDiffChars must be an integer from 1000 to 200000.`);
  }

  if (typeof config.model !== "string" || config.model.trim() === "") {
    throw new CommitlyError(`${source}: model must be a non-empty string.`);
  }

  if (
    typeof config.reasoningEffort !== "string" ||
    !["none", "low", "medium", "high", "xhigh", "max"].includes(config.reasoningEffort)
  ) {
    throw new CommitlyError(
      `${source}: reasoningEffort must be one of none, low, medium, high, xhigh, max.`,
    );
  }

  return {
    typesAllowed,
    maxLength: config.maxLength,
    maxDiffChars: config.maxDiffChars,
    model: config.model.trim(),
    reasoningEffort: config.reasoningEffort,
  };
}
