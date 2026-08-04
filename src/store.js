import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

export function createEmptyData() {
  return {
    users: [],
    households: [],
    memberships: [],
    expenses: [],
    expenseShares: [],
    payments: [],
    counters: {
      users: 1,
      households: 1,
      memberships: 1,
      expenses: 1,
      expenseShares: 1,
      payments: 1,
    },
  };
}

export class MemoryStore {
  constructor(seed = createEmptyData()) {
    this.data = clone(seed);
    this.mutationQueue = Promise.resolve();
  }

  async read() {
    return clone(this.data);
  }

  async write(nextData) {
    this.data = clone(nextData);
  }

  mutate(mutator) {
    const mutation = this.mutationQueue.then(async () => {
      const nextData = await this.read();
      const result = await mutator(nextData);
      await this.write(nextData);
      return result;
    });
    this.mutationQueue = mutation.catch(() => undefined);
    return mutation;
  }
}

export class JsonFileStore extends MemoryStore {
  constructor(filePath = path.resolve(process.cwd(), "data", "rentsplit.json")) {
    super(createEmptyData());
    this.filePath = path.resolve(filePath);
  }

  async read() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return { ...createEmptyData(), ...JSON.parse(raw) };
    } catch (error) {
      if (error.code === "ENOENT") {
        return createEmptyData();
      }
      throw error;
    }
  }

  async write(nextData) {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(nextData, null, 2)}\n`, "utf8");
    try {
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

export class PostgresStore extends MemoryStore {
  constructor(connectionString, { pool } = {}) {
    super(createEmptyData());
    if (!connectionString && !pool) throw new Error("A PostgreSQL connection string is required.");
    this.pool = pool || new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    this.ready = null;
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rentsplit_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(
      "INSERT INTO rentsplit_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",
      [JSON.stringify(createEmptyData())],
    );
  }

  ensureReady() {
    this.ready ??= this.initialize();
    return this.ready;
  }

  async read() {
    await this.ensureReady();
    const result = await this.pool.query("SELECT data FROM rentsplit_state WHERE id = 1");
    return { ...createEmptyData(), ...clone(result.rows[0].data) };
  }

  async write(nextData) {
    await this.ensureReady();
    await this.pool.query(
      "INSERT INTO rentsplit_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()",
      [JSON.stringify(nextData)],
    );
  }

  async close() {
    await this.pool.end();
  }
}

export function nextId(data, collectionName) {
  const prefixes = {
    users: "usr",
    households: "home",
    memberships: "mem",
    expenses: "exp",
    expenseShares: "share",
    payments: "pay",
  };
  const next = data.counters[collectionName] ?? 1;
  data.counters[collectionName] = next + 1;
  return `${prefixes[collectionName] || "id"}_${next}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
