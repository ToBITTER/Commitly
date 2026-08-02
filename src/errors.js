export class RentSplitError extends Error {
  constructor(message, { status = 400, code = "bad_request", cause } = {}) {
    super(message);
    this.name = "RentSplitError";
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

export function notFound(resource, id) {
  return new RentSplitError(`${resource} not found: ${id}`, {
    status: 404,
    code: "not_found",
  });
}

export function conflict(message) {
  return new RentSplitError(message, {
    status: 409,
    code: "conflict",
  });
}
