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

Commitly uses the OpenAI Responses API.

```sh
export OPENAI_API_KEY="your-api-key"
```

PowerShell:

```powershell
$env:OPENAI_API_KEY="your-api-key"
```

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

Pick a model:

```sh
commitly --model gpt-5.6-luna
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
  "model": "gpt-5.6-luna",
  "reasoningEffort": "none"
}
```

Options:

- `typesAllowed`: Conventional Commit types the model may use
- `maxLength`: maximum length for the generated one-line message
- `maxDiffChars`: maximum diff characters sent to the model
- `model`: default OpenAI model
- `reasoningEffort`: model reasoning effort; `none` is fast and cheap for commit messages

`COMMITLY_MODEL` and `--model` override the config model.

## Friendly Errors

Commitly stops early with readable errors when:

- no files are staged
- Git is missing
- the command is not run inside a Git repository
- `OPENAI_API_KEY` is missing or invalid
- OpenAI rate limits or network failures happen
- `.commitlyrc` contains invalid JSON

Use `--offline` when you want Commitly to generate a local heuristic message without an OpenAI API key.

## Publish Checklist

- Run `npm test`
- Run `npm run verify`
- Run `commitly --help`
- Test `commitly --dry-run` in a real repo with staged changes
- Record `docs/demo.gif`
- Confirm the package name is available
- Run `npm publish`
- Test `npm install -g commitly` in a clean terminal
