#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runCommitly } from "../src/cli.js";
import { CommitlyError } from "../src/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

const program = new Command();

program
  .name("commitly")
  .description("Generate Conventional Commit messages from staged git changes.")
  .version(packageJson.version)
  .option("--dry-run", "print the generated message without committing")
  .option("--offline", "generate a message locally without calling OpenAI")
  .option("-c, --config <path>", "path to a .commitlyrc JSON config file")
  .option("-m, --model <model>", "OpenAI model to use")
  .option("-y, --yes", "accept the first generated message without prompting")
  .action(async (options) => {
    await runCommitly(options);
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommitlyError) {
    const writer = error.exitCode === 0 ? console.log : console.error;
    writer(error.message);
    process.exitCode = error.exitCode;
  } else {
    console.error("Commitly failed unexpectedly. Run with DEBUG=commitly to see details.");
    if (process.env.DEBUG === "commitly") {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
