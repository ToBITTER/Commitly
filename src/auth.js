import { randomBytes } from "node:crypto";
import pg from "pg";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

const { Pool } = pg;

export function createAuthService({ databaseUrl, secret, baseUrl, emailNotifier }) {
  if (!databaseUrl) return null;
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
  const emailEnabled = Boolean(emailNotifier?.enabled);
  const options = {
    database: pool,
    secret: resolvedSecret,
    baseURL: baseUrl,
    basePath: "/api/auth",
    trustedOrigins: [baseUrl],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: emailEnabled,
    },
    ...(emailEnabled ? {
      emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: ({ user, url }) => emailNotifier.sendVerificationEmail({ user, url }),
      },
    } : {}),
  };
  const auth = betterAuth(options);

  return {
    handler: toNodeHandler(auth),
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
