import { CommitlyError } from "./errors.js";

const NETWORK_ERROR_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"]);

export async function generateOllamaCommitMessage({ diff, config, previousMessages = [] }) {
  const host = normalizeOllamaHost(process.env.OLLAMA_HOST || "http://localhost:11434");

  try {
    const response = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages: [
          {
            role: "system",
            content: buildInstructions(config),
          },
          {
            role: "user",
            content: buildUserPrompt({ diff, config, previousMessages }),
          },
        ],
        options: {
          temperature: 0.2,
          num_predict: 120,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw await normalizeOllamaHttpError(response, config.model);
    }

    const payload = await response.json();
    return cleanCommitMessage(payload?.message?.content, config);
  } catch (error) {
    if (error instanceof CommitlyError) {
      throw error;
    }

    throw normalizeOllamaError(error, config.model);
  }
}

export function cleanCommitMessage(rawMessage, config) {
  const text = String(rawMessage || "")
    .trim()
    .replace(/^```(?:text|txt|commit|git)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const conventionalLine = lines.find((line) => getConventionalParts(line));
  const candidate = conventionalLine || lines[0];

  if (!candidate) {
    throw new CommitlyError("Ollama returned an empty commit message. Try again.");
  }

  const conventional = ensureConventionalMessage(candidate, config.typesAllowed);
  return enforceMaxLength(conventional, config.maxLength);
}

function buildInstructions(config) {
  return [
    "You are Commitly, a local CLI assistant that writes precise git commit messages.",
    "Return exactly one Conventional Commit message on one line.",
    "Do not include markdown, quotes, explanations, alternatives, or a body.",
    `Allowed types: ${config.typesAllowed.join(", ")}.`,
    `Maximum length: ${config.maxLength} characters.`,
    "Use an optional scope only when it is obvious from the diff.",
    "Use an imperative, specific, developer-friendly description.",
  ].join("\n");
}

function buildUserPrompt({ diff, config, previousMessages = [] }) {
  const previousSection = previousMessages.length
    ? `\nAvoid repeating these previous suggestions:\n${previousMessages
        .map((message) => `- ${message}`)
        .join("\n")}\n`
    : "";

  return [
    "Generate one commit message for this staged git diff.",
    previousSection,
    "Staged diff:",
    "```diff",
    truncateDiff(diff, config.maxDiffChars),
    "```",
  ].join("\n");
}

function truncateDiff(diff, maxDiffChars) {
  if (diff.length <= maxDiffChars) {
    return diff;
  }

  const headLength = Math.floor(maxDiffChars * 0.7);
  const tailLength = maxDiffChars - headLength;
  const head = diff.slice(0, headLength).trimEnd();
  const tail = diff.slice(diff.length - tailLength).trimStart();

  return `${head}\n\n[... diff truncated by Commitly ...]\n\n${tail}`;
}

function normalizeLine(line) {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^commit message:\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureConventionalMessage(message, typesAllowed) {
  const parts = getConventionalParts(message);

  if (parts && typesAllowed.includes(parts.type)) {
    return message;
  }

  if (parts) {
    const replacementType = typesAllowed[0] || "chore";
    return `${replacementType}${parts.scope || ""}${parts.breaking || ""}: ${parts.description}`;
  }

  const fallbackType = typesAllowed[0] || "chore";
  const description = message.replace(/^[a-z\s-]+:\s*/i, "").trim();
  return `${fallbackType}: ${description}`;
}

function getConventionalParts(message) {
  const match = message.match(/^([a-z]+)(\([a-z0-9._/-]+\))?(!)?:\s+(.+)$/);

  if (!match) {
    return null;
  }

  return {
    type: match[1],
    scope: match[2] || "",
    breaking: match[3] || "",
    description: match[4].trim(),
  };
}

function enforceMaxLength(message, maxLength) {
  if (message.length <= maxLength) {
    return message;
  }

  const parts = getConventionalParts(message);
  if (!parts) {
    return trimAtWordBoundary(message, maxLength);
  }

  const prefix = `${parts.type}${parts.scope}${parts.breaking}: `;
  const availableDescriptionLength = maxLength - prefix.length;

  if (availableDescriptionLength < 8) {
    return trimAtWordBoundary(message, maxLength);
  }

  return `${prefix}${trimAtWordBoundary(parts.description, availableDescriptionLength)}`;
}

function trimAtWordBoundary(value, maxLength) {
  const sliced = value.slice(0, maxLength).trim();
  const wordSafe = sliced.replace(/\s+\S*$/, "").trim();
  return wordSafe || sliced;
}

async function normalizeOllamaHttpError(response, model) {
  const detail = await response.text();

  if (response.status === 404 || /model.*not found|not found.*model/i.test(detail)) {
    return new CommitlyError(
      `Ollama could not find model "${model}". Run: ollama pull ${model}`,
    );
  }

  return new CommitlyError(
    `Ollama request failed with HTTP ${response.status}. ${detail || "Check Ollama logs."}`,
  );
}

function normalizeOllamaError(error, model) {
  if (isNetworkError(error) || error instanceof TypeError) {
    return new CommitlyError(
      `Ollama is not running at ${process.env.OLLAMA_HOST || "http://localhost:11434"}. Install/start Ollama, then run: ollama pull ${model}`,
      { cause: error },
    );
  }

  if (error?.name === "TimeoutError") {
    return new CommitlyError("Ollama took too long to respond. Try a smaller model or rerun the command.", {
      cause: error,
    });
  }

  return new CommitlyError(`Ollama request failed: ${error?.message || "unknown error"}`, {
    cause: error,
  });
}

function normalizeOllamaHost(host) {
  return host.replace(/\/+$/, "");
}

function isNetworkError(error) {
  return NETWORK_ERROR_CODES.has(error?.code) || NETWORK_ERROR_CODES.has(error?.cause?.code);
}
