import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rename, rm } from "node:fs/promises";

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
