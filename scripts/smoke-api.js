import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const server = createServer(createApp({ store: new MemoryStore() }));
server.listen(0);
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const ada = await post("/users", { name: "Ada", email: "ada@example.com" });
  const ben = await post("/users", { name: "Ben", email: "ben@example.com" });
  const home = await post("/households", { name: "Flat 4B", currency: "NGN", createdByUserId: ada.id });
  await post(`/households/${home.id}/members`, { userId: ben.id });
  await post(`/households/${home.id}/expenses`, {
    description: "August rent",
    amount: "200000.00",
    paidByUserId: ada.id,
    participantUserIds: [ada.id, ben.id],
    dueDate: "2026-08-05",
    category: "rent",
  });
  const balances = await get(`/households/${home.id}/balances`);
  assert.equal(balances.settlements.length, 1);
  assert.equal(balances.settlements[0].fromUserId, ben.id);
  assert.equal(balances.settlements[0].amount, "100000.00");
  console.log("RentSplit smoke test passed");
} finally {
  server.close();
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return parse(response);
}

async function post(path, body) {
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
