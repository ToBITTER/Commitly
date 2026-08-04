import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { createAuthService } from "./auth.js";
import { createEmailNotifier } from "./notifications.js";
import { JsonFileStore, PostgresStore } from "./store.js";

export function startServer({
  port = getPort(),
  host = getHost(),
  dataFile = getDataFile(),
  databaseUrl = getDatabaseUrl(),
  baseUrl = getBaseUrl(port),
  authSecret = process.env.BETTER_AUTH_SECRET?.trim(),
} = {}) {
  const store = databaseUrl ? new PostgresStore(databaseUrl) : new JsonFileStore(dataFile);
  const emailNotifier = createEmailNotifier({
    apiKey: process.env.RESEND_API_KEY?.trim(),
    from: process.env.EMAIL_FROM?.trim(),
    appUrl: baseUrl,
  });
  const auth = createAuthService({ databaseUrl, secret: authSecret, baseUrl, emailNotifier });
  const server = createServer(createApp({ store, auth, emailNotifier }));

  void Promise.all([store.initialize?.(), auth?.initialize?.()]).then(() => {
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`RentSplit running on http://localhost:${actualPort}`);
      console.log(databaseUrl ? "Storage: PostgreSQL with account authentication" : `Storage: ${store.filePath}`);
      console.log(`Email notifications: ${emailNotifier.enabled ? "enabled" : "disabled"}`);
    });
  }).catch((error) => {
    queueMicrotask(() => server.emit("error", error));
  });

  server.on("close", () => {
    void Promise.allSettled([store.close?.(), auth?.close?.()]).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") console.error("Could not close a database connection cleanly.", result.reason);
      }
    });
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

function getBaseUrl(port) {
  return (process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, "");
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";

if (import.meta.url === entrypoint) {
  const server = startServer();
  server.on("error", (error) => {
    console.error("RentSplit could not start.", error);
    process.exitCode = 1;
  });
  const shutdown = () => server.close();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
