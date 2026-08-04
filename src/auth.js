import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import pg from "pg";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

const { Pool } = pg;

const TRUSTED_CLIENT_IP_HEADER = "x-rentsplit-client-ip";

export function createAuthService({ databaseUrl, secret, baseUrl, trustedOrigins = [baseUrl], trustProxyHeaders = false }) {
  if (!databaseUrl) return null;
  const normalizedBaseUrl = normalizeOrigin(baseUrl);
  if (!normalizedBaseUrl) throw new Error("A valid public base URL is required for authentication.");
  const normalizedTrustedOrigins = [...new Set([normalizedBaseUrl, ...trustedOrigins.map(normalizeOrigin).filter(Boolean)])];
  let resolvedSecret = secret;
  if (!resolvedSecret || resolvedSecret.length < 32 || resolvedSecret.includes("replace-with")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BETTER_AUTH_SECRET must be set to a random value of at least 32 characters.");
    }
    resolvedSecret = randomBytes(32).toString("hex");
    console.warn("BETTER_AUTH_SECRET is not set; using a temporary development secret for this process.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const options = {
    database: pool,
    secret: resolvedSecret,
    baseURL: normalizedBaseUrl,
    basePath: "/api/auth",
    trustedOrigins: normalizedTrustedOrigins,
    advanced: {
      useSecureCookies: normalizedBaseUrl.startsWith("https://"),
      ipAddress: {
        ipAddressHeaders: trustProxyHeaders ? [TRUSTED_CLIENT_IP_HEADER] : ["x-forwarded-for"],
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: false,
    },
  };
  const auth = betterAuth(options);
  const nodeHandler = toNodeHandler(auth);

  return {
    handler(request, response) {
      if (trustProxyHeaders) setTrustedClientIp(request);
      return nodeHandler(request, response);
    },
    async initialize() {
      const { runMigrations } = await getMigrations(options);
      await runMigrations();
    },
    async getSession(request) {
      return auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    },
    async close() {
      await pool.end();
    },
  };
}

function setTrustedClientIp(request) {
  delete request.headers[TRUSTED_CLIENT_IP_HEADER];
  const cloudflareIp = firstHeaderValue(request.headers["cf-connecting-ip"]);
  const forwardedIp = firstHeaderValue(request.headers["x-forwarded-for"]);
  const clientIp = [cloudflareIp, forwardedIp].find((value) => value && isIP(value));
  if (clientIp) request.headers[TRUSTED_CLIENT_IP_HEADER] = clientIp;
}

function firstHeaderValue(value) {
  const header = Array.isArray(value) ? value[0] : value;
  return typeof header === "string" ? header.split(",", 1)[0].trim() : null;
}

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
