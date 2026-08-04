import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicUrl, resolveTrustedOrigins } from "../src/server.js";

test("uses Render's public URL instead of a stale localhost auth URL", () => {
  const environment = {
    RENDER: "true",
    RENDER_EXTERNAL_URL: "https://rentsplit-479c.onrender.com/",
    RENDER_EXTERNAL_HOSTNAME: "rentsplit-479c.onrender.com",
    BETTER_AUTH_URL: "http://localhost:3000",
  };

  assert.equal(resolvePublicUrl(3000, environment), "https://rentsplit-479c.onrender.com");
  assert.deepEqual(resolveTrustedOrigins("https://rentsplit-479c.onrender.com", environment), [
    "https://rentsplit-479c.onrender.com",
  ]);
});

test("normalizes an explicit public authentication URL", () => {
  const environment = { BETTER_AUTH_URL: "https://app.example.com/auth/path/" };
  assert.equal(resolvePublicUrl(3000, environment), "https://app.example.com");
  assert.deepEqual(resolveTrustedOrigins("https://app.example.com", environment), ["https://app.example.com"]);
});
