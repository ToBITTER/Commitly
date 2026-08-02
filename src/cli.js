import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { loadConfig } from "./config.js";
import { CommitlyError } from "./errors.js";
import { commitStagedChanges, getStagedDiff } from "./git.js";
import { generateCommitMessage } from "./llm.js";
import { generateOfflineCommitMessage } from "./offline.js";

export async function runCommitly(options = {}) {
  const cwd = process.cwd();
  const config = await loadConfig({
    cwd,
    configPath: options.config,
    modelOverride: options.model,
  });
  const diff = await getStagedDiff({ cwd });
  const previousMessages = [];
  const generateMessage = () =>
    options.offline
      ? generateOfflineCommitMessage({ diff, config, previousMessages })
      : generateCommitMessage({ diff, config, previousMessages });
  let message = await generateMessage();

  if (options.dryRun) {
    console.log(message);
    return;
  }

  if (options.yes) {
    await createCommit({ cwd, message });
    return;
  }

  if (!input.isTTY) {
    throw new CommitlyError(
      "Commitly needs an interactive terminal. Re-run with --dry-run or --yes for non-interactive use.",
    );
  }

  const terminal = readline.createInterface({ input, output });

  try {
    while (true) {
      printSuggestion(message);
      const action = await askAction(terminal);

      if (action === "accept") {
        await createCommit({ cwd, message });
        return;
      }

      if (action === "edit") {
        const edited = await askEditedMessage(terminal, message);
        await createCommit({ cwd, message: edited });
        return;
      }

      if (action === "regenerate") {
        previousMessages.push(message);
        message = await generateMessage();
        continue;
      }

      throw new CommitlyError("Commit cancelled.", { exitCode: 0 });
    }
  } finally {
    terminal.close();
  }
}

async function createCommit({ cwd, message }) {
  const outputText = await commitStagedChanges({ cwd, message });
  console.log(`Committed with: ${message}`);
  if (outputText.trim()) {
    console.log(outputText.trim());
  }
}

function printSuggestion(message) {
  console.log("");
  console.log("Suggested commit message:");
  console.log(`  ${message}`);
  console.log("");
}

async function askAction(terminal) {
  while (true) {
    const answer = (
      await terminal.question("Accept, edit, regenerate, or cancel? [a/e/r/c] ")
    )
      .trim()
      .toLowerCase();

    if (answer === "" || answer === "a" || answer === "accept") {
      return "accept";
    }

    if (answer === "e" || answer === "edit") {
      return "edit";
    }

    if (answer === "r" || answer === "regenerate") {
      return "regenerate";
    }

    if (answer === "c" || answer === "cancel") {
      return "cancel";
    }

    console.log("Please choose accept, edit, regenerate, or cancel.");
  }
}

async function askEditedMessage(terminal, currentMessage) {
  while (true) {
    const edited = (await terminal.question(`Edit message [${currentMessage}]: `)).trim();

    if (!edited) {
      return currentMessage;
    }

    if (edited.length > 0) {
      return edited;
    }
  }
}
