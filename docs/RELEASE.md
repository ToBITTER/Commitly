# Release Plan

Commitly ships as the `commitly-ai` npm package and installs a `commitly` terminal command.

## Before Publishing

1. Confirm `GEMINI_API_KEY` works locally, or use `--offline` for a no-key demo.
2. Stage a real change in a Git repository.
3. Run:

```sh
npm run verify
node ./bin/commitly.js --offline --dry-run
```

4. Run `node ./bin/commitly.js --provider gemini --dry-run` when a Gemini key is available.
5. Record `docs/demo.gif` after a successful offline or live run.
6. Commit and push the repo to GitHub.

## GitHub

```sh
git init
git add .
git commit -m "feat: scaffold ai commit cli"
gh repo create commitly --public --source . --remote origin --push
```

## npm Publishing

The unscoped `commitly` package name is already taken on npm, so this project uses `commitly-ai`.

For local publishing:

```sh
npm login
npm publish
```

For GitHub Actions publishing:

1. Push this repo to GitHub.
2. In npm, configure this GitHub repo as a trusted publisher for `commitly-ai`.
3. Run the `Publish` workflow manually from GitHub Actions.

## Fresh Install Test

After publish:

```sh
npm install -g commitly-ai
commitly --help
```

Then test in a clean Git repository with staged changes:

```sh
commitly --offline --dry-run
commitly --provider gemini --dry-run
```
