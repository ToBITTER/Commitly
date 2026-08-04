import test from "node:test";
import assert from "node:assert/strict";
import { createEmailNotifier } from "../src/notifications.js";

test("sends roommate invitation email through Resend", async () => {
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
    await notifier.memberAdded({
      store: invitationStore(),
      householdId: "home_1",
      userId: "user_2",
      invitedByUserId: "user_1",
    });

    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.Authorization, `Bearer ${apiKey}`);
    assert.equal(request.options.headers["User-Agent"], "rentsplit/1.0");
    assert.deepEqual(request.body.to, ["ben@example.com"]);
    assert.match(request.body.html, /You were added to Lagos Flat/);
    assert.match(request.body.html, /Ada added you/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("disables a placeholder Resend credential before it can break notifications", () => {
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
  const result = await notifier.memberAdded({
    store: invitationStore(),
    householdId: "home_1",
    userId: "user_2",
    invitedByUserId: "user_1",
  });
  assert.deepEqual(result, { sent: 0, failed: 0, skipped: 1 });
});

function invitationStore() {
  return {
    async read() {
      return {
        households: [{ id: "home_1", name: "Lagos Flat" }],
        users: [
          { id: "user_1", name: "Ada", email: "ada@example.com" },
          { id: "user_2", name: "Ben", email: "ben@example.com" },
        ],
      };
    },
  };
}
