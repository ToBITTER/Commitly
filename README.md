# Commitly

Commitly is an AI Git commit CLI that reads your staged diff and proposes a clean Conventional Commit message.

## Install

```sh
npm install -g commitly-ai
```

For local development:

```sh
npm install
npm link
```

## Setup

Commitly uses Gemini by default. Create a free Gemini API key in Google AI Studio:

```text
https://aistudio.google.com/apikey
```

```sh
export GEMINI_API_KEY="your-api-key"
```

PowerShell:

```powershell
$env:GEMINI_API_KEY="your-api-key"
```

OpenAI is still available as an optional provider with `--provider openai`.

## Usage

```sh
git add src/index.js
commitly
```

Commitly will:

- read `git diff --cached`
- generate a Conventional Commit message
- let you accept, edit, regenerate, or cancel
- run `git commit -m "<message>"` when accepted

Dry run:

```sh
commitly --dry-run
```

No-cost offline mode:

```sh
commitly --offline --dry-run
```

Pick a provider:

```sh
commitly --provider gemini --dry-run
commitly --provider openai --dry-run
```

Pick a model:

```sh
commitly --model gemini-2.5-flash
```

Commit immediately with the first suggestion:

```sh
commitly --yes
```

Use a custom config file:

```sh
commitly --config .commitlyrc
```

## Demo

![Commitly terminal demo](docs/demo.gif)

Record the demo after the CLI is published:

```sh
asciinema rec docs/demo.cast
agg docs/demo.cast docs/demo.gif
```

## Config

Create `.commitlyrc` in the repo where you run Commitly:

```json
{
  "typesAllowed": ["feat", "fix", "docs", "refactor", "test", "chore"],
  "maxLength": 72,
  "maxDiffChars": 12000,
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "reasoningEffort": "none"
}
```

Options:

- `typesAllowed`: Conventional Commit types the model may use
- `maxLength`: maximum length for the generated one-line message
- `maxDiffChars`: maximum diff characters sent to the model
- `provider`: `gemini`, `openai`, or `offline`
- `model`: default model for the selected provider
- `reasoningEffort`: OpenAI reasoning effort; ignored by Gemini and offline mode

`COMMITLY_PROVIDER`, `COMMITLY_MODEL`, `--provider`, and `--model` override config values.

## Friendly Errors

Commitly stops early with readable errors when:

- no files are staged
- Git is missing
- the command is not run inside a Git repository
- `GEMINI_API_KEY` is missing or invalid
- `OPENAI_API_KEY` is missing or invalid
- Gemini/OpenAI rate limits or network failures happen
- `.commitlyrc` contains invalid JSON

Use `--offline` when you want Commitly to generate a local heuristic message without any API key.

## Publish Checklist

- Run `npm test`
- Run `npm run verify`
- Run `commitly --help`
- Test `commitly --offline --dry-run` in a real repo with staged changes
- Test `commitly --provider gemini --dry-run` when `GEMINI_API_KEY` is available
- Record `docs/demo.gif`
- Confirm the package name is available
- Run `npm publish`
- Test `npm install -g commitly-ai` in a clean terminal
