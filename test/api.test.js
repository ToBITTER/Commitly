import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

test("HTTP API creates roommates, expenses, and balances", async () => {
  const server = createServer(createApp({ store: new MemoryStore() }));
  server.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const ada = await post(baseUrl, "/users", { name: "Ada", email: "ada.api@example.com" });
    const ben = await post(baseUrl, "/users", { name: "Ben", email: "ben.api@example.com" });
    const household = await post(baseUrl, "/households", {
      name: "Ikoyi Flat",
      currency: "NGN",
      createdByUserId: ada.id,
    });
    await post(baseUrl, `/households/${household.id}/members`, { userId: ben.id });
    await post(baseUrl, `/households/${household.id}/expenses`, {
      description: "Generator fuel",
      amount: "20000.00",
      paidByUserId: ada.id,
      participantUserIds: [ada.id, ben.id],
      category: "utilities",
      dueDate: "2026-08-04",
    });
    const balances = await get(baseUrl, `/households/${household.id}/balances`);
    assert.equal(balances.household.name, "Ikoyi Flat");
    assert.deepEqual(balances.settlements, [
      {
        fromUserId: ben.id,
        fromUserName: "Ben",
        toUserId: ada.id,
        toUserName: "Ada",
        amount: "10000.00",
      },
    ]);
    await post(baseUrl, `/households/${household.id}/payments`, {
      fromUserId: ben.id,
      toUserId: ada.id,
      amount: "10000.00",
      note: "Fuel balance",
    });
    const payments = await get(baseUrl, `/households/${household.id}/payments`);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].note, "Fuel balance");
  } finally {
    server.close();
  }
});

test("HTTP API returns friendly validation errors", async () => {
  const server = createServer(createApp({ store: new MemoryStore() }));
  server.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A", email: "bad-email" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "bad_request");
    assert.match(payload.error.message, /name must be 2-80 characters/);

    const arrayResponse = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    });
    const arrayPayload = await arrayResponse.json();
    assert.equal(arrayResponse.status, 400);
    assert.equal(arrayPayload.error.code, "invalid_body");
  } finally {
    server.close();
  }
});

test("HTTP server delivers the browser application", async () => {
  const server = createServer(createApp({ store: new MemoryStore() }));
  server.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const pageResponse = await fetch(baseUrl);
    const page = await pageResponse.text();
    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get("content-type"), /text\/html/);
    assert.match(page, /RentSplit — Shared home finances/);

    const scriptResponse = await fetch(`${baseUrl}/app.js`);
    const script = await scriptResponse.text();
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type"), /text\/javascript/);
    assert.match(script, /async function saveExpense/);
  } finally {
    server.close();
  }
});

test("authenticated accounts cannot access unrelated household data", async () => {
  const store = new MemoryStore();
  const auth = {
    async handler(_request, response) {
      response.writeHead(404);
      response.end();
    },
    async getSession(request) {
      const email = request.headers["x-test-email"];
      if (!email) return null;
      return { user: { id: `auth-${email}`, name: request.headers["x-test-name"] || "Test User", email } };
    },
  };
  const server = createServer(createApp({ store, auth }));
  server.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const adaHeaders = { "x-test-email": "ada.secure@example.com", "x-test-name": "Ada" };
  const benHeaders = { "x-test-email": "ben.secure@example.com", "x-test-name": "Ben" };
  try {
    const anonymousResponse = await fetch(`${baseUrl}/households`);
    assert.equal(anonymousResponse.status, 401);

    const [ada] = await get(baseUrl, "/users", adaHeaders);
    const household = await post(baseUrl, "/households", { name: "Secure Flat", currency: "NGN" }, adaHeaders);
    const expense = await post(baseUrl, `/households/${household.id}/expenses`, {
      description: "Private rent",
      amount: "1200.00",
      paidByUserId: ada.id,
      participantUserIds: [ada.id],
    }, adaHeaders);
    const benUsersBeforeInvite = await get(baseUrl, "/users", benHeaders);
    const benHouseholdsBeforeInvite = await get(baseUrl, "/households", benHeaders);
    assert.equal(benUsersBeforeInvite.length, 1);
    assert.equal(benUsersBeforeInvite[0].email, "ben.secure@example.com");
    assert.deepEqual(benHouseholdsBeforeInvite, []);

    for (const path of [
      `/households/${household.id}`,
      `/households/${household.id}/expenses`,
      `/households/${household.id}/payments`,
      `/households/${household.id}/balances`,
      `/households/${household.id}/reminders`,
    ]) {
      const forbiddenResponse = await fetch(`${baseUrl}${path}`, { headers: benHeaders });
      assert.equal(forbiddenResponse.status, 403, `${path} should reject an unrelated account`);
    }

    for (const [path, body] of [
      [`/households/${household.id}/invitations`, { name: "Mallory", email: "mallory@example.com" }],
      [`/households/${household.id}/expenses`, { description: "Intrusion", amount: "1.00", participantUserIds: [ada.id] }],
      [`/households/${household.id}/expenses/${expense.id}/cover`, { paidByUserId: ada.id }],
      [`/households/${household.id}/payments`, { fromUserId: ada.id, toUserId: "usr_missing", amount: "1.00" }],
      [`/households/${household.id}/reminders/send`, {}],
    ]) {
      const forbiddenResponse = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...benHeaders },
        body: JSON.stringify(body),
      });
      assert.equal(forbiddenResponse.status, 403, `${path} should reject an unrelated account`);
    }

    const legacyMemberResponse = await fetch(`${baseUrl}/households/${household.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adaHeaders },
      body: JSON.stringify({ userId: benUsersBeforeInvite[0].id }),
    });
    assert.equal(legacyMemberResponse.status, 400);
    assert.equal((await legacyMemberResponse.json()).error.code, "invitation_required");

    await post(baseUrl, "/households", { name: "Ben Home", currency: "NGN" }, benHeaders);
    const adaHouseholds = await get(baseUrl, "/households", adaHeaders);
    const benHouseholds = await get(baseUrl, "/households", benHeaders);
    assert.deepEqual(adaHouseholds.map((item) => item.name), ["Secure Flat"]);
    assert.deepEqual(benHouseholds.map((item) => item.name), ["Ben Home"]);

    await post(baseUrl, `/households/${household.id}/invitations`, { name: "Ben", email: "ben.secure@example.com" }, adaHeaders);
    const benHouseholdsAfterInvite = await get(baseUrl, "/households", benHeaders);
    assert.deepEqual(benHouseholdsAfterInvite.map((item) => item.name).sort(), ["Ben Home", "Secure Flat"]);
  } finally {
    server.close();
  }
});

async function get(baseUrl, path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return parse(response);
}

async function post(baseUrl, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return parse(response);
}

async function parse(response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}
