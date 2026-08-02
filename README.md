# Commitly

Commitly is an Ollama-powered Git commit CLI that reads your staged diff and proposes a clean Conventional Commit message.

No cloud API key. No OpenAI. No Gemini. It runs against your local Ollama server by default.

## Install

```sh
npm install -g commitly-ai
```

For local development:

```sh
npm install
npm link
```

## Ollama Setup

Install Ollama, then pull the default lightweight coding model:

```sh
ollama pull qwen2.5-coder:1.5b
```

Commitly calls:

```text
http://localhost:11434/api/chat
```

Use `OLLAMA_HOST` if your Ollama server runs elsewhere.

## Usage

```sh
git add src/index.js
commitly
```

Commitly will:

- read `git diff --cached`
- ask Ollama for a Conventional Commit message
- let you accept, edit, regenerate, or cancel
- run `git commit -m "<message>"` when accepted

Dry run:

```sh
commitly --dry-run
```

Deterministic fallback without Ollama:

```sh
commitly --offline --dry-run
```

Pick a different Ollama model:

```sh
commitly --model llama3.2 --dry-run
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
  "model": "qwen2.5-coder:1.5b"
}
```

Options:

- `typesAllowed`: Conventional Commit types Commitly may use
- `maxLength`: maximum length for the generated one-line message
- `maxDiffChars`: maximum diff characters sent to Ollama
- `model`: Ollama model name

`COMMITLY_MODEL` and `--model` override the config model.

## Friendly Errors

Commitly stops early with readable errors when:

- no files are staged
- Git is missing
- the command is not run inside a Git repository
- Ollama is not running
- the configured Ollama model has not been pulled
- `.commitlyrc` contains invalid JSON

## Publish Checklist

- Run `npm test`
- Run `npm run verify`
- Run `commitly --help`
- Test `commitly --offline --dry-run` in a real repo with staged changes
- Test `commitly --dry-run` after `ollama pull qwen2.5-coder:1.5b`
- Record `docs/demo.gif`
- Confirm the package name is available
- Run `npm publish`
- Test `npm install -g commitly-ai` in a clean terminal
