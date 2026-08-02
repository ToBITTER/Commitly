import OpenAI from "openai";
import { CommitlyError, MissingApiKeyError } from "./errors.js";
import { buildInstructions, buildUserPrompt } from "./prompt.js";

const NETWORK_ERROR_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"]);

export async function generateCommitMessage({ diff, config, previousMessages = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new MissingApiKeyError();
  }

  const client = new OpenAI();

  try {
    const response = await client.responses.create({
      model: config.model,
      instructions: buildInstructions(config),
      input: buildUserPrompt({ diff, config, previousMessages }),
      reasoning: { effort: config.reasoningEffort },
      max_output_tokens: 120,
    });

    return cleanCommitMessage(response.output_text, config);
  } catch (error) {
    if (error instanceof CommitlyError) {
      throw error;
    }

    throw normalizeOpenAIError(error);
  }
}

export function cleanCommitMessage(rawMessage, config) {
  const text = unwrapModelText(rawMessage);
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const conventionalLine = lines.find((line) => getConventionalParts(line));
  const candidate = conventionalLine || lines[0];

  if (!candidate) {
    throw new CommitlyError("The model returned an empty commit message. Try again.");
  }

  const conventional = ensureConventionalMessage(candidate, config.typesAllowed);
  return enforceMaxLength(conventional, config.maxLength);
}

function unwrapModelText(rawMessage) {
  return String(rawMessage || "")
    .trim()
    .replace(/^```(?:text|txt|commit|git)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
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

function normalizeOpenAIError(error) {
  if (error?.status === 401) {
    return new CommitlyError("OpenAI rejected the API key. Check OPENAI_API_KEY and try again.", {
      cause: error,
    });
  }

  if (error?.status === 429) {
    return new CommitlyError("OpenAI rate limit reached. Wait a moment, then regenerate.", {
      cause: error,
    });
  }

  if (NETWORK_ERROR_CODES.has(error?.code)) {
    return new CommitlyError("Network error while calling OpenAI. Check your connection and try again.", {
      cause: error,
    });
  }

  return new CommitlyError(`OpenAI request failed: ${error?.message || "unknown error"}`, {
    cause: error,
  });
}
