export class CommitlyError extends Error {
  constructor(message, { exitCode = 1, cause } = {}) {
    super(message);
    this.name = "CommitlyError";
    this.exitCode = exitCode;
    this.cause = cause;
  }
}

export class EmptyDiffError extends CommitlyError {
  constructor() {
    super("No staged changes found. Stage files with git add before running commitly.");
    this.name = "EmptyDiffError";
  }
}
