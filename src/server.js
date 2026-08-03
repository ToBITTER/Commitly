import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { JsonFileStore } from "./store.js";

export function startServer({ port = getPort(), dataFile = getDataFile() } = {}) {
  const store = new JsonFileStore(dataFile);
  const server = createServer(createApp({ store }));

  server.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`RentSplit API running on http://localhost:${actualPort}`);
    console.log(`Data file: ${store.filePath}`);
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

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";

if (import.meta.url === entrypoint) {
  startServer();
}
