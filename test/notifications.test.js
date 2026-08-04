import test from "node:test";
import assert from "node:assert/strict";
import { createEmailNotifier } from "../src/notifications.js";

test("sends verification email through Resend with a direct verification action", async () => {
  const originalFetch = globalThis.fetch;
  const apiKey = ["re", "12345678901234567890"].join("_");
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ id: "email_1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const notifier = createEmailNotifier({
      apiKey,
      from: "RentSplit <notifications@example.com>",
      appUrl: "https://rentsplit.example.com",
    });
    await notifier.sendVerificationEmail({
      user: { name: "Ada", email: "ada@example.com" },
      url: "https://rentsplit.example.com/api/auth/verify-email?token=secure-token",
    });

    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.Authorization, `Bearer ${apiKey}`);
    assert.equal(request.options.headers["User-Agent"], "rentsplit/1.0");
    assert.deepEqual(request.body.to, ["ada@example.com"]);
    assert.match(request.body.html, /Verify my email/);
    assert.match(request.body.html, /verify-email\?token=secure-token/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("disables a placeholder Resend credential before it can break signup", () => {
  const notifier = createEmailNotifier({
    apiKey: "re_your_api_key",
    from: "RentSplit <notifications@example.com>",
    appUrl: "https://rentsplit.example.com",
  });
  assert.equal(notifier.enabled, false);
  assert.match(notifier.configurationError, /complete Resend API token/);
});

test("skips email delivery cleanly when Resend is not configured", async () => {
  const notifier = createEmailNotifier({ appUrl: "http://localhost:3000" });
  const result = await notifier.sendVerificationEmail({
    user: { name: "Ada", email: "ada@example.com" },
    url: "http://localhost:3000/verify",
  });
  assert.deepEqual(result, { skipped: true });
});
