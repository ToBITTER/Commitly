# Release Plan

Commitly ships as the `commitly-ai` npm package and installs a `commitly` terminal command.

## Before Publishing

1. Stage a real change in a Git repository.
2. Run:

```sh
npm run verify
node ./bin/commitly.js --dry-run
```

3. Record `docs/demo.gif` after a successful run.
4. Commit and push the repo to GitHub.

## GitHub

```sh
git init
git add .
git commit -m "feat: scaffold local commit cli"
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
commitly --dry-run
```
