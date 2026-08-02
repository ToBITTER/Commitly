export function buildInstructions(config) {
  return [
    "You are Commitly, a CLI assistant that writes precise git commit messages.",
    "Return exactly one Conventional Commit message on one line.",
    "Do not include markdown, quotes, explanations, alternatives, or a body.",
    `Allowed types: ${config.typesAllowed.join(", ")}.`,
    `Maximum length: ${config.maxLength} characters.`,
    "Use an optional scope only when it is obvious from the diff.",
    "Use an imperative, specific, developer-friendly description.",
  ].join("\n");
}

export function buildUserPrompt({ diff, config, previousMessages = [] }) {
  const preparedDiff = truncateDiff(diff, config.maxDiffChars);
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
    preparedDiff,
    "```",
  ].join("\n");
}

export function truncateDiff(diff, maxDiffChars) {
  if (diff.length <= maxDiffChars) {
    return diff;
  }

  const headLength = Math.floor(maxDiffChars * 0.7);
  const tailLength = maxDiffChars - headLength;
  const head = diff.slice(0, headLength).trimEnd();
  const tail = diff.slice(diff.length - tailLength).trimStart();

  return `${head}\n\n[... diff truncated by Commitly ...]\n\n${tail}`;
}
