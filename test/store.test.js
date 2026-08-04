import assert from "node:assert/strict";
import test from "node:test";
import { createUser } from "../src/services/rentsplit.js";
import { PostgresStore } from "../src/store.js";

test("PostgresStore initializes and persists application state", async () => {
  const pool = new FakePostgresPool();
  const store = new PostgresStore(null, { pool });
  await createUser(store, { name: "Ada", email: "ada@postgres.example.com" });
  const data = await store.read();
  assert.equal(data.users.length, 1);
  assert.equal(data.users[0].name, "Ada");
  await store.close();
  assert.equal(pool.closed, true);
});

class FakePostgresPool {
  constructor() {
    this.data = null;
    this.closed = false;
  }

  async query(sql, values = []) {
    const normalized = sql.trim().replace(/\s+/g, " ");
    if (normalized.startsWith("CREATE TABLE")) return { rows: [] };
    if (normalized.startsWith("INSERT INTO") && normalized.includes("DO NOTHING")) {
      this.data ??= JSON.parse(values[0]);
      return { rows: [] };
    }
    if (normalized.startsWith("SELECT data")) return { rows: [{ data: structuredClone(this.data) }] };
    if (normalized.startsWith("INSERT INTO") && normalized.includes("DO UPDATE")) {
      this.data = JSON.parse(values[0]);
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${normalized}`);
  }

  async end() {
    this.closed = true;
  }
}
