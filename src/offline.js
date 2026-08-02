const DOC_EXTENSIONS = new Set([".md", ".mdx", ".rst"]);
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".php",
  ".rb",
]);

export function generateOfflineCommitMessage({ diff, config }) {
  const summary = parseDiffSummary(diff);
  const type = pickAllowedType(pickType(summary), config.typesAllowed);
  const scope = pickScope(summary);
  const subject = pickSubject(summary);
  const prefix = scope ? `${type}(${scope}): ` : `${type}: `;

  return enforceMaxLength(`${prefix}${subject}`, config.maxLength);
}

export function parseDiffSummary(diff) {
  const files = [];
  let currentFile = null;

  for (const line of diff.split(/\r?\n/)) {
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);

    if (fileMatch) {
      currentFile = {
        path: fileMatch[2],
        additions: 0,
        deletions: 0,
        isNew: false,
        isDeleted: false,
      };
      files.push(currentFile);
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith("new file mode")) {
      currentFile.isNew = true;
      continue;
    }

    if (line.startsWith("deleted file mode")) {
      currentFile.isDeleted = true;
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentFile.additions += 1;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      currentFile.deletions += 1;
    }
  }

  return {
    files,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
  };
}

function pickType(summary) {
  if (summary.files.length === 0) {
    return "chore";
  }

  if (summary.files.every(isDocFile)) {
    return "docs";
  }

  if (summary.files.every(isTestFile)) {
    return "test";
  }

  if (summary.files.every(isCiFile)) {
    return "ci";
  }

  if (summary.files.every(isBuildFile)) {
    return "build";
  }

  if (summary.files.some((file) => file.isNew) && summary.additions > 0) {
    return "feat";
  }

  if (summary.files.some(isSourceFile) && summary.additions >= summary.deletions) {
    return "feat";
  }

  if (summary.deletions > summary.additions * 2) {
    return "refactor";
  }

  return "chore";
}

function pickScope(summary) {
  const paths = summary.files.map((file) => file.path);

  if (paths.length === 0) {
    return "";
  }

  if (paths.some((filePath) => filePath.startsWith("bin/"))) {
    return "cli";
  }

  if (paths.some((filePath) => filePath.startsWith("src/"))) {
    return "cli";
  }

  if (paths.every((filePath) => filePath.startsWith(".github/"))) {
    return "ci";
  }

  if (paths.length === 1) {
    return slugify(baseName(paths[0]));
  }

  const topLevelFolders = new Set(
    paths
      .map((filePath) => filePath.split("/")[0])
      .filter((part) => part && !part.includes(".")),
  );

  if (topLevelFolders.size === 1) {
    return slugify([...topLevelFolders][0]);
  }

  return "";
}

function pickSubject(summary) {
  if (summary.files.length === 0) {
    return "update staged changes";
  }

  const target = describeTarget(summary);

  if (summary.files.every((file) => file.isNew)) {
    return `add ${target}`;
  }

  if (summary.files.every((file) => file.isDeleted)) {
    return `remove ${target}`;
  }

  if (summary.files.every(isTestFile)) {
    return `update ${target}`;
  }

  if (summary.files.every(isDocFile)) {
    return `update ${target}`;
  }

  if (summary.deletions > summary.additions * 2) {
    return `simplify ${target}`;
  }

  return `update ${target}`;
}

function describeTarget(summary) {
  const paths = summary.files.map((file) => file.path);

  if (paths.length === 1) {
    return humanizePath(paths[0]);
  }

  if (summary.files.every(isDocFile)) {
    return "documentation";
  }

  if (summary.files.every(isTestFile)) {
    return "tests";
  }

  if (summary.files.every(isCiFile)) {
    return "ci workflow";
  }

  if (summary.files.every(isBuildFile)) {
    return "package config";
  }

  if (paths.some((filePath) => filePath.startsWith("src/") || filePath.startsWith("bin/"))) {
    return "cli";
  }

  return "staged changes";
}

function isDocFile(file) {
  return file.path.startsWith("docs/") || DOC_EXTENSIONS.has(extension(file.path));
}

function isTestFile(file) {
  return /(^|\/)(test|tests|__tests__)\//.test(file.path) || /\.(test|spec)\.[a-z]+$/.test(file.path);
}

function isCiFile(file) {
  return file.path.startsWith(".github/workflows/");
}

function isBuildFile(file) {
  return /^(package-lock\.json|package\.json|tsconfig\.json|vite\.config\.)/.test(file.path);
}

function isSourceFile(file) {
  return file.path.startsWith("src/") || file.path.startsWith("bin/") || SOURCE_EXTENSIONS.has(extension(file.path));
}

function humanizePath(filePath) {
  const name = baseName(filePath);

  if (/^readme$/i.test(name)) {
    return "readme";
  }

  if (/^package(-lock)?$/i.test(name)) {
    return "package config";
  }

  return name
    .replace(/[-_]+/g, " ")
    .replace(/\bcli\b/i, "CLI")
    .trim();
}

function baseName(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const filename = normalized.split("/").pop() || normalized;
  return filename.replace(/\.[^.]+$/, "");
}

function extension(filePath) {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

function pickAllowedType(type, typesAllowed) {
  if (typesAllowed.includes(type)) {
    return type;
  }

  return typesAllowed[0] || "chore";
}

function enforceMaxLength(message, maxLength) {
  if (message.length <= maxLength) {
    return message;
  }

  const sliced = message.slice(0, maxLength).trim();
  return sliced.replace(/\s+\S*$/, "").trim() || sliced;
}
