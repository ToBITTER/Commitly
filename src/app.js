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
  findOrCreateAuthenticatedUser,
  getHousehold,
  getReminderDigest,
  inviteMember,
  listExpenses,
  listHouseholds,
  listPayments,
  listUsers,
  markExpensePaid,
  recordPayment,
} from "./services/rentsplit.js";
import { notifySafely } from "./notifications.js";

const BODY_LIMIT_BYTES = 1_000_000;

export function createApp({ store = new MemoryStore(), auth = null, emailNotifier = null } = {}) {
  return async function rentSplitApp(request, response) {
    addCorsHeaders(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      const url = new URL(request.url, "http://localhost");
      if (auth && url.pathname.startsWith("/api/auth/")) {
        await auth.handler(request, response);
        return;
      }
      const route = routeRequest(request.method, url.pathname);
      if (!route && (request.method === "GET" || request.method === "HEAD")) {
        const served = await serveStatic(url.pathname, request.method, response);
        if (served) return;
      }
      if (!route) throw new RentSplitError("Route not found.", { status: 404, code: "route_not_found" });
      const currentUser = auth && route.authentication !== false
        ? await resolveCurrentUser(store, auth, request)
        : null;
      if (auth && route.authentication !== false && route.authentication !== "optional" && !currentUser) {
        throw new RentSplitError("Sign in to continue.", { status: 401, code: "authentication_required" });
      }
      const body = route.needsBody ? await readJsonBody(request) : {};
      const result = await route.handler({
        store,
        auth,
        emailNotifier,
        currentUser,
        body,
        params: route.params || {},
        query: url.searchParams,
      });
      sendJson(response, route.status || 200, result);
    } catch (error) {
      handleError(response, error);
    }
  };
}

function routeRequest(method, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (method === "GET" && pathname === "/api") return { authentication: false, handler: apiRoot };
  if (method === "GET" && pathname === "/health") return { authentication: false, handler: ({ store }) => health(store) };
  if (method === "GET" && pathname === "/session") {
    return {
      authentication: "optional",
      handler: ({ auth, emailNotifier, currentUser }) => ({
        authenticationRequired: Boolean(auth),
        emailNotificationsEnabled: Boolean(emailNotifier?.enabled),
        user: currentUser,
      }),
    };
  }
  if (method === "GET" && pathname === "/users") {
    return { handler: ({ store, currentUser }) => listUsers(store, currentUser?.id) };
  }
  if (method === "POST" && pathname === "/users") {
    return {
      needsBody: true,
      status: 201,
      handler: ({ store, body, auth }) => {
        if (auth) {
          throw new RentSplitError("Invite roommates from inside a household.", { status: 400, code: "invitation_required" });
        }
        return createUser(store, body);
      },
    };
  }
  if (method === "GET" && pathname === "/households") {
    return { handler: ({ store, currentUser }) => listHouseholds(store, currentUser?.id) };
  }
  if (method === "POST" && pathname === "/households") {
    return {
      needsBody: true,
      status: 201,
      handler: ({ store, body, currentUser }) => createHousehold(store, body, currentUser?.id),
    };
  }
  if (parts[0] === "households" && parts[1]) {
    const householdId = parts[1];
    if (method === "GET" && parts.length === 2) {
      return { params: { householdId }, handler: ({ store, params, currentUser }) => getHousehold(store, params.householdId, currentUser?.id) };
    }
    if (method === "POST" && parts[2] === "members" && parts.length === 3) {
      return {
        needsBody: true,
        status: 201,
        params: { householdId },
        handler: async ({ store, auth, params, body, currentUser, emailNotifier }) => {
          if (auth) {
            throw new RentSplitError("Invite roommates by email instead.", { status: 400, code: "invitation_required" });
          }
          const membership = await addMember(store, params.householdId, body, currentUser?.id);
          if (emailNotifier) {
            await notifySafely("roommate invitation", () => emailNotifier.memberAdded({
              store,
              householdId: params.householdId,
              userId: membership.userId,
              invitedByUserId: currentUser?.id,
            }));
          }
          return membership;
        },
      };
    }
    if (method === "POST" && parts[2] === "invitations" && parts.length === 3) {
      return {
        needsBody: true,
        status: 201,
        params: { householdId },
        handler: async ({ store, params, body, currentUser, emailNotifier }) => {
          const membership = await inviteMember(store, params.householdId, body, currentUser?.id);
          if (emailNotifier) {
            await notifySafely("roommate invitation", () => emailNotifier.memberAdded({
              store,
              householdId: params.householdId,
              userId: membership.userId,
              invitedByUserId: currentUser?.id,
            }));
          }
          return membership;
        },
      };
    }
    if (method === "GET" && parts[2] === "expenses" && parts.length === 3) {
      return { params: { householdId }, handler: ({ store, params, currentUser }) => listExpenses(store, params.householdId, currentUser?.id) };
    }
    if (method === "POST" && parts[2] === "expenses" && parts.length === 3) {
      return {
        needsBody: true,
        status: 201,
        params: { householdId },
        handler: async ({ store, params, body, currentUser, emailNotifier }) => {
          const expense = await createExpense(store, params.householdId, body, currentUser?.id);
          if (emailNotifier) {
            await notifySafely("new expense", () => emailNotifier.expenseCreated({
              store,
              householdId: params.householdId,
              expenseId: expense.id,
            }));
          }
          return expense;
        },
      };
    }
    if (method === "POST" && parts[2] === "expenses" && parts[3] && parts[4] === "cover" && parts.length === 5) {
      return {
        needsBody: true,
        params: { householdId, expenseId: parts[3] },
        handler: async ({ store, params, body, currentUser, emailNotifier }) => {
          const expense = await markExpensePaid(store, params.householdId, params.expenseId, body, currentUser?.id);
          if (emailNotifier) {
            await notifySafely("paid bill", () => emailNotifier.expenseCovered({
              store,
              householdId: params.householdId,
              expenseId: expense.id,
            }));
          }
          return expense;
        },
      };
    }
    if (method === "POST" && parts[2] === "payments" && parts.length === 3) {
      return {
        needsBody: true,
        status: 201,
        params: { householdId },
        handler: async ({ store, params, body, currentUser, emailNotifier }) => {
          const payment = await recordPayment(store, params.householdId, body, currentUser?.id);
          if (emailNotifier) {
            await notifySafely("recorded payment", () => emailNotifier.paymentRecorded({
              store,
              householdId: params.householdId,
              paymentId: payment.id,
            }));
          }
          return payment;
        },
      };
    }
    if (method === "GET" && parts[2] === "payments" && parts.length === 3) {
      return { params: { householdId }, handler: ({ store, params, currentUser }) => listPayments(store, params.householdId, currentUser?.id) };
    }
    if (method === "GET" && parts[2] === "balances" && parts.length === 3) {
      return { params: { householdId }, handler: ({ store, params, currentUser }) => calculateBalances(store, params.householdId, currentUser?.id) };
    }
    if (method === "GET" && parts[2] === "reminders" && parts.length === 3) {
      return {
        params: { householdId },
        handler: ({ store, params, query, currentUser }) => getReminderDigest(store, params.householdId, { asOf: query.get("asOf") }, currentUser?.id),
      };
    }
    if (method === "POST" && parts[2] === "reminders" && parts[3] === "send" && parts.length === 4) {
      return {
        needsBody: true,
        params: { householdId },
        handler: async ({ store, params, body, currentUser, emailNotifier }) => {
          const household = await getHousehold(store, params.householdId, currentUser?.id);
          const membership = household.members.find((member) => member.userId === currentUser?.id);
          if (currentUser && membership?.role !== "owner") {
            throw new RentSplitError("Only a household owner can email reminders.", { status: 403, code: "owner_required" });
          }
          const digest = await getReminderDigest(store, params.householdId, { asOf: body.asOf }, currentUser?.id);
          const delivery = emailNotifier
            ? await notifySafely("payment reminder", () => emailNotifier.reminderDigest({ store, digest }))
            : { sent: 0, failed: 0, skipped: digest.count };
          return { ...digest, delivery };
        },
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
      "GET /session",
      "GET /users",
      "POST /users",
      "GET /households",
      "POST /households",
      "GET /households/:id",
      "POST /households/:id/members",
      "POST /households/:id/invitations",
      "GET /households/:id/expenses",
      "POST /households/:id/expenses",
      "POST /households/:id/expenses/:expenseId/cover",
      "GET /households/:id/payments",
      "POST /households/:id/payments",
      "GET /households/:id/balances",
      "GET /households/:id/reminders",
      "POST /households/:id/reminders/send",
    ],
  };
}

async function resolveCurrentUser(store, auth, request) {
  const session = await auth.getSession(request);
  if (!session?.user) return null;
  return findOrCreateAuthenticatedUser(store, session.user);
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
