import { URL } from "node:url";
import { RentSplitError } from "./errors.js";
import { serveStatic } from "./static.js";
import { MemoryStore } from "./store.js";
import {
  addMember,
  calculateBalances,
  createExpense,
  createHousehold,
  createUser,
  getHousehold,
  getReminderDigest,
  listExpenses,
  listHouseholds,
  listPayments,
  listUsers,
  recordPayment,
} from "./services/rentsplit.js";

const BODY_LIMIT_BYTES = 1_000_000;

export function createApp({ store = new MemoryStore() } = {}) {
  return async function rentSplitApp(request, response) {
    addCorsHeaders(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      const url = new URL(request.url, "http://localhost");
      const route = routeRequest(request.method, url.pathname);
      if (!route && (request.method === "GET" || request.method === "HEAD")) {
        const served = await serveStatic(url.pathname, request.method, response);
        if (served) return;
      }
      if (!route) throw new RentSplitError("Route not found.", { status: 404, code: "route_not_found" });
      const body = route.needsBody ? await readJsonBody(request) : {};
      const result = await route.handler({ store, body, params: route.params || {}, query: url.searchParams });
      sendJson(response, route.status || 200, result);
    } catch (error) {
      handleError(response, error);
    }
  };
}

function routeRequest(method, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (method === "GET" && pathname === "/api") return { handler: apiRoot };
  if (method === "GET" && pathname === "/health") return { handler: ({ store }) => health(store) };
  if (method === "GET" && pathname === "/users") return { handler: ({ store }) => listUsers(store) };
  if (method === "POST" && pathname === "/users") {
    return { needsBody: true, status: 201, handler: ({ store, body }) => createUser(store, body) };
  }
  if (method === "GET" && pathname === "/households") return { handler: ({ store }) => listHouseholds(store) };
  if (method === "POST" && pathname === "/households") {
    return { needsBody: true, status: 201, handler: ({ store, body }) => createHousehold(store, body) };
  }
  if (parts[0] === "households" && parts[1]) {
    const householdId = parts[1];
    if (method === "GET" && parts.length === 2) {
      return { params: { householdId }, handler: ({ store, params }) => getHousehold(store, params.householdId) };
    }
    if (method === "POST" && parts[2] === "members" && parts.length === 3) {
      return {
        needsBody: true,
        status: 201,
        params: { householdId },
        handler: ({ store, params, body }) => addMember(store, params.householdId, body),
      };
    }
    if (method === "GET" && parts[2] === "expenses" && parts.length === 3) {
      return { params: { householdId }, handler: ({ store, params }) => listExpenses(store, params.householdId) };
    }
    if (method === "POST" && parts[2] === "expenses" && parts.length === 3) {
      return {
        needsBody: true,
        status: 201,
        params: { householdId },
        handler: ({ store, params, body }) => createExpense(store, params.householdId, body),
      };
    }
    if (method === "POST" && parts[2] === "payments" && parts.length === 3) {
      return {
        needsBody: true,
        status: 201,
        params: { householdId },
        handler: ({ store, params, body }) => recordPayment(store, params.householdId, body),
      };
    }
    if (method === "GET" && parts[2] === "payments" && parts.length === 3) {
      return { params: { householdId }, handler: ({ store, params }) => listPayments(store, params.householdId) };
    }
    if (method === "GET" && parts[2] === "balances" && parts.length === 3) {
      return { params: { householdId }, handler: ({ store, params }) => calculateBalances(store, params.householdId) };
    }
    if (method === "GET" && parts[2] === "reminders" && parts.length === 3) {
      return {
        params: { householdId },
        handler: ({ store, params, query }) => getReminderDigest(store, params.householdId, { asOf: query.get("asOf") }),
      };
    }
  }
  return null;
}

function apiRoot() {
  return {
    service: "rentsplit-api",
    status: "ok",
    endpoints: [
      "GET /health",
      "GET /users",
      "POST /users",
      "GET /households",
      "POST /households",
      "GET /households/:id",
      "POST /households/:id/members",
      "GET /households/:id/expenses",
      "POST /households/:id/expenses",
      "GET /households/:id/payments",
      "POST /households/:id/payments",
      "GET /households/:id/balances",
      "GET /households/:id/reminders",
    ],
  };
}

async function health(store) {
  await store.read();
  return { status: "ok", service: "rentsplit-api" };
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > BODY_LIMIT_BYTES) {
      throw new RentSplitError("Request body is too large.", { status: 413, code: "body_too_large" });
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RentSplitError("Request body must be a JSON object.", { code: "invalid_body" });
    }
    return body;
  } catch (error) {
    if (error instanceof RentSplitError) throw error;
    throw new RentSplitError("Request body must be valid JSON.", { status: 400, code: "invalid_json", cause: error });
  }
}

function addCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJson(response, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function handleError(response, error) {
  if (error instanceof RentSplitError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } });
    return;
  }
  console.error(error);
  sendJson(response, 500, { error: { code: "internal_error", message: "RentSplit hit an unexpected error." } });
}
