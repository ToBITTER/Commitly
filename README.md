# Commitly

Commitly is a local Git commit CLI that reads your staged diff and proposes a clean Conventional Commit message.

No API key. No billing. No cloud provider.

## Install

```sh
npm install -g commitly-ai
```

For local development:

```sh
npm install
npm link
```

## Usage

```sh
git add src/index.js
commitly
```

Commitly will:

- read `git diff --cached`
- generate a Conventional Commit message locally
- let you accept, edit, regenerate, or cancel
- run `git commit -m "<message>"` when accepted

Dry run:

```sh
commitly --dry-run
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
  "maxDiffChars": 12000
}
```

Options:

- `typesAllowed`: Conventional Commit types Commitly may use
- `maxLength`: maximum length for the generated one-line message
- `maxDiffChars`: maximum diff characters Commitly reads before summarizing

## Friendly Errors

Commitly stops early with readable errors when:

- no files are staged
- Git is missing
- the command is not run inside a Git repository
- `.commitlyrc` contains invalid JSON

## Publish Checklist

- Run `npm test`
- Run `npm run verify`
- Run `commitly --help`
- Test `commitly --dry-run` in a real repo with staged changes
- Record `docs/demo.gif`
- Confirm the package name is available
- Run `npm publish`
- Test `npm install -g commitly-ai` in a clean terminal
