const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function createEmailNotifier({ apiKey, from, appUrl }) {
  const normalizedApiKey = String(apiKey || "").trim();
  const normalizedFrom = String(from || "").trim();
  const configurationError = getConfigurationError(normalizedApiKey, normalizedFrom);
  const enabled = !configurationError && Boolean(normalizedApiKey && normalizedFrom);
  const homeUrl = String(appUrl || "http://localhost:3000").replace(/\/$/, "");

  async function send({ to, subject, text, actionUrl = homeUrl, actionLabel = "Open RentSplit" }) {
    if (!enabled) return { skipped: true };
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalizedApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "rentsplit/1.0",
      },
      body: JSON.stringify({
        from: normalizedFrom,
        to: [to],
        subject,
        text,
        html: emailDocument(subject, text, actionUrl, actionLabel),
      }),
    });
    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`Resend rejected an email with status ${response.status}: ${payload.slice(0, 240)}`);
    }
    return response.json();
  }

  async function sendMany(messages) {
    if (!enabled) return { sent: 0, failed: 0, skipped: messages.length };
    const results = await Promise.allSettled(messages.map(send));
    return {
      sent: results.filter((result) => result.status === "fulfilled").length,
      failed: results.filter((result) => result.status === "rejected").length,
      skipped: 0,
    };
  }

  return {
    enabled,
    configurationError,
    sendVerificationEmail({ user, url }) {
      return send({
        to: user.email,
        subject: "Verify your RentSplit account",
        text: `Hi ${user.name},\n\nVerify your email to finish creating your RentSplit account:\n${url}\n\nIf you did not sign up, you can ignore this email.`,
        actionUrl: url,
        actionLabel: "Verify my email",
      });
    },
    async memberAdded({ store, householdId, userId, invitedByUserId }) {
      const data = await store.read();
      const household = data.households.find((item) => item.id === householdId);
      const user = data.users.find((item) => item.id === userId);
      const invitedBy = data.users.find((item) => item.id === invitedByUserId);
      if (!household || !user) return { sent: 0, failed: 0, skipped: 1 };
      return sendMany([{
        to: user.email,
        subject: `You were added to ${household.name}`,
        text: `Hi ${user.name},\n\n${invitedBy?.name || "A roommate"} added you to ${household.name} on RentSplit. Sign up with this email address to view bills, balances, and payments.\n\nOpen RentSplit: ${homeUrl}`,
      }]);
    },
    async expenseCreated({ store, householdId, expenseId }) {
      const data = await store.read();
      const household = data.households.find((item) => item.id === householdId);
      const expense = data.expenses.find((item) => item.id === expenseId);
      if (!household || !expense) return { sent: 0, failed: 0, skipped: 0 };
      const shares = data.expenseShares.filter((share) => share.expenseId === expense.id);
      const payer = data.users.find((user) => user.id === expense.paidByUserId);
      const messages = shares.flatMap((share) => {
        const user = data.users.find((item) => item.id === share.userId);
        if (!user) return [];
        const statusLine = expensePaymentStatus(expense) === "unpaid"
          ? "Nobody has covered this bill yet."
          : `${payer?.name || "A roommate"} covered the full bill.`;
        return [{
          to: user.email,
          subject: `${expense.description} was added to ${household.name}`,
          text: `Hi ${user.name},\n\nA ${household.currency} ${money(share.amountCents)} share was added for you from ${expense.description}. ${statusLine}\n\nOpen RentSplit: ${homeUrl}`,
        }];
      });
      return sendMany(dedupeMessages(messages));
    },
    async paymentRecorded({ store, householdId, paymentId }) {
      const data = await store.read();
      const household = data.households.find((item) => item.id === householdId);
      const payment = data.payments.find((item) => item.id === paymentId);
      if (!household || !payment) return { sent: 0, failed: 0, skipped: 0 };
      const fromUser = data.users.find((user) => user.id === payment.fromUserId);
      const toUser = data.users.find((user) => user.id === payment.toUserId);
      const recipients = [fromUser, toUser].filter(Boolean);
      return sendMany(dedupeMessages(recipients.map((user) => ({
        to: user.email,
        subject: `Payment recorded in ${household.name}`,
        text: `Hi ${user.name},\n\n${fromUser?.name || "A roommate"} paid ${toUser?.name || "a roommate"} ${household.currency} ${money(payment.amountCents)}.${payment.note ? ` Note: ${payment.note}` : ""}\n\nOpen RentSplit: ${homeUrl}`,
      }))));
    },
    async expenseCovered({ store, householdId, expenseId }) {
      const data = await store.read();
      const household = data.households.find((item) => item.id === householdId);
      const expense = data.expenses.find((item) => item.id === expenseId);
      const payer = data.users.find((user) => user.id === expense?.paidByUserId);
      if (!household || !expense) return { sent: 0, failed: 0, skipped: 0 };
      const userIds = data.expenseShares.filter((share) => share.expenseId === expense.id).map((share) => share.userId);
      const recipients = data.users.filter((user) => userIds.includes(user.id));
      return sendMany(dedupeMessages(recipients.map((user) => ({
        to: user.email,
        subject: `${expense.description} has been paid`,
        text: `Hi ${user.name},\n\n${payer?.name || "A roommate"} has now covered ${expense.description} in ${household.name}. RentSplit updated everyone’s balance.\n\nOpen RentSplit: ${homeUrl}`,
      }))));
    },
    async reminderDigest({ store, digest }) {
      const data = await store.read();
      const household = data.households.find((item) => item.id === digest.household.id);
      if (!household) return { sent: 0, failed: 0, skipped: digest.reminders.length };
      const messages = digest.reminders.flatMap((reminder) => {
        const user = data.users.find((item) => item.id === reminder.userId);
        if (!user) return [];
        return [{
          to: user.email,
          subject: `Payment reminder from ${household.name}`,
          text: `Hi ${user.name},\n\n${reminder.message}\n\nOpen RentSplit: ${homeUrl}`,
        }];
      });
      return sendMany(messages);
    },
  };
}

function getConfigurationError(apiKey, from) {
  if (!apiKey && !from) return null;
  if (!apiKey) return "RESEND_API_KEY is missing.";
  if (!/^re_[A-Za-z0-9_-]{20,}$/.test(apiKey) || /your|replace|example|xxxxx/i.test(apiKey)) {
    return "RESEND_API_KEY does not look like a complete Resend API token.";
  }
  if (!from) return "EMAIL_FROM is missing.";
  const senderEmail = from.match(/<([^<>]+)>$/)?.[1] || from;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(senderEmail)) return "EMAIL_FROM must contain a valid sender email address.";
  return null;
}

export async function notifySafely(label, task) {
  try {
    return await task();
  } catch (error) {
    console.error(`Could not send ${label} email notifications.`, error);
    return { sent: 0, failed: 1, skipped: 0 };
  }
}

function emailDocument(subject, text, actionUrl, actionLabel) {
  const paragraphs = text.split("\n\n").map((paragraph) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;color:#17251f;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border-radius:18px"><div style="font-size:20px;font-weight:700;margin-bottom:24px">RentSplit</div><h1 style="font-size:24px;margin:0 0 18px">${escapeHtml(subject)}</h1>${paragraphs}<a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:8px;padding:12px 18px;border-radius:10px;background:#de5f45;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)}</a></div></body></html>`;
}

function dedupeMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    const email = message.to.toLowerCase();
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

function expensePaymentStatus(expense) {
  return expense.paymentStatus === "unpaid" ? "unpaid" : "paid";
}

function money(amountCents) {
  return (amountCents / 100).toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}
