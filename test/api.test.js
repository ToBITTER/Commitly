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

async function get(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  return parse(response);
}

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse(response);
}

async function parse(response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}
