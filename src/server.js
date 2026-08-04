import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { JsonFileStore, PostgresStore } from "./store.js";

export function startServer({ port = getPort(), host = getHost(), dataFile = getDataFile(), databaseUrl = getDatabaseUrl() } = {}) {
  const store = databaseUrl ? new PostgresStore(databaseUrl) : new JsonFileStore(dataFile);
  const server = createServer(createApp({ store }));

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`RentSplit API running on http://localhost:${actualPort}`);
    console.log(databaseUrl ? "Storage: PostgreSQL" : `Data file: ${store.filePath}`);
  });

  server.on("close", () => {
    void store.close?.().catch((error) => console.error("Could not close the data store cleanly.", error));
  });

  return server;
}

function getPort() {
  const rawPort = process.env.PORT || process.env.RENTSPLIT_PORT || "3000";
  const port = Number(rawPort);
  return Number.isInteger(port) && port >= 0 && port <= 65_535 ? port : 3000;
}

function getDataFile() {
  return path.resolve(process.env.RENTSPLIT_DATA_FILE || path.join(process.cwd(), "data", "rentsplit.json"));
}

function getHost() {
  return process.env.HOST || "0.0.0.0";
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || null;
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";

if (import.meta.url === entrypoint) {
  const server = startServer();
  const shutdown = () => server.close();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
