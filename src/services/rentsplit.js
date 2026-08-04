import { conflict, notFound, RentSplitError } from "../errors.js";
import { centsToMoney, splitEvenly, toCents } from "../money.js";
import { nextId } from "../store.js";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLE_VALUES = new Set(["owner", "member"]);
const PAYMENT_STATUS_VALUES = new Set(["paid", "unpaid"]);

export async function findOrCreateAuthenticatedUser(store, identity) {
  identity = requireObject(identity, "authenticated user");
  const authUserId = requireText(identity.id, "authenticated user id", 1, 160);
  const name = requireText(identity.name, "name", 2, 80);
  const email = normalizeEmail(identity.email);
  const currentData = await store.read();
  const currentUser = currentData.users.find((user) => user.authUserId === authUserId || user.email === email);
  if (currentUser?.authUserId === authUserId && currentUser.name === name && currentUser.email === email) {
    return serializeUser(currentUser);
  }
  return store.mutate((data) => {
    const matchedById = data.users.find((user) => user.authUserId === authUserId);
    const matchedByEmail = data.users.find((user) => user.email === email);
    if (matchedById && matchedByEmail && matchedById.id !== matchedByEmail.id) {
      throw conflict("This account email is already connected to another RentSplit profile.");
    }
    const user = matchedById || matchedByEmail;
    if (user) {
      if (user.authUserId && user.authUserId !== authUserId) {
        throw conflict("This RentSplit profile is already connected to another account.");
      }
      user.authUserId = authUserId;
      user.name = name;
      user.email = email;
      return serializeUser(user);
    }
    const created = { id: nextId(data, "users"), authUserId, name, email, phone: null, createdAt: now() };
    data.users.push(created);
    return serializeUser(created);
  });
}

export async function createUser(store, payload) {
  payload = requireObject(payload);
  return store.mutate((data) => {
    const name = requireText(payload.name, "name", 2, 80);
    const email = normalizeEmail(payload.email);
    const phone = optionalText(payload.phone, "phone", 30);
    if (data.users.some((user) => user.email === email)) throw conflict(`A user already exists with email ${email}.`);
    const user = { id: nextId(data, "users"), name, email, phone, createdAt: now() };
    data.users.push(user);
    return serializeUser(user);
  });
}

export async function listUsers(store, actorUserId = null) {
  const data = await store.read();
  if (!actorUserId) return data.users.map(serializeUser);
  assertUser(data, actorUserId);
  const householdIds = new Set(data.memberships.filter((member) => member.userId === actorUserId).map((member) => member.householdId));
  const visibleUserIds = new Set(data.memberships.filter((member) => householdIds.has(member.householdId)).map((member) => member.userId));
  visibleUserIds.add(actorUserId);
  return data.users.filter((user) => visibleUserIds.has(user.id)).map(serializeUser);
}

export async function createHousehold(store, payload, actorUserId = null) {
  payload = requireObject(payload);
  return store.mutate((data) => {
    const name = requireText(payload.name, "name", 2, 80);
    const currency = normalizeCurrency(payload.currency || "NGN");
    const household = { id: nextId(data, "households"), name, currency, createdAt: now() };
    data.households.push(household);
    const ownerUserId = actorUserId || payload.createdByUserId;
    if (ownerUserId) {
      assertUser(data, ownerUserId);
      data.memberships.push({
        id: nextId(data, "memberships"),
        householdId: household.id,
        userId: ownerUserId,
        role: "owner",
        joinedAt: now(),
      });
    }
    return serializeHousehold(household, data);
  });
}

export async function listHouseholds(store, actorUserId = null) {
  const data = await store.read();
  const householdIds = actorUserId
    ? new Set(data.memberships.filter((member) => member.userId === actorUserId).map((member) => member.householdId))
    : null;
  if (actorUserId) assertUser(data, actorUserId);
  return data.households.filter((household) => !householdIds || householdIds.has(household.id)).map((household) => serializeHousehold(household, data));
}

export async function getHousehold(store, householdId, actorUserId = null) {
  const data = await store.read();
  const household = assertHousehold(data, householdId);
  assertActorMembership(data, household.id, actorUserId);
  return serializeHousehold(household, data);
}

export async function addMember(store, householdId, payload, actorUserId = null) {
  payload = requireObject(payload);
  return store.mutate((data) => {
    const household = assertHousehold(data, householdId);
    assertActorMembership(data, household.id, actorUserId, { ownerOnly: true });
    const user = assertUser(data, payload.userId);
    const role = payload.role || "member";
    if (!ROLE_VALUES.has(role)) throw new RentSplitError("role must be either owner or member.");
    if (data.memberships.some((member) => member.householdId === household.id && member.userId === user.id)) {
      throw conflict(`${user.name} is already a member of ${household.name}.`);
    }
    const membership = { id: nextId(data, "memberships"), householdId: household.id, userId: user.id, role, joinedAt: now() };
    data.memberships.push(membership);
    return serializeMembership(membership, data);
  });
}

export async function inviteMember(store, householdId, payload, actorUserId = null) {
  payload = requireObject(payload);
  return store.mutate((data) => {
    const household = assertHousehold(data, householdId);
    assertActorMembership(data, household.id, actorUserId, { ownerOnly: true });
    const name = requireText(payload.name, "name", 2, 80);
    const email = normalizeEmail(payload.email);
    const role = payload.role || "member";
    if (!ROLE_VALUES.has(role)) throw new RentSplitError("role must be either owner or member.");
    let user = data.users.find((candidate) => candidate.email === email);
    if (!user) {
      user = {
        id: nextId(data, "users"),
        name,
        email,
        phone: optionalText(payload.phone, "phone", 30),
        createdAt: now(),
      };
      data.users.push(user);
    }
    if (data.memberships.some((member) => member.householdId === household.id && member.userId === user.id)) {
      throw conflict(`${user.name} is already a member of ${household.name}.`);
    }
    const membership = { id: nextId(data, "memberships"), householdId: household.id, userId: user.id, role, joinedAt: now() };
    data.memberships.push(membership);
    return serializeMembership(membership, data);
  });
}

export async function createExpense(store, householdId, payload, actorUserId = null) {
  payload = requireObject(payload);
  return store.mutate((data) => {
    const household = assertHousehold(data, householdId);
    assertActorMembership(data, household.id, actorUserId);
    const paymentStatus = payload.paymentStatus || "paid";
    if (!PAYMENT_STATUS_VALUES.has(paymentStatus)) throw new RentSplitError("paymentStatus must be either paid or unpaid.");
    const paidBy = paymentStatus === "paid" ? assertMember(data, household.id, payload.paidByUserId) : null;
    const amountCents = toCents(payload.amount, "amount");
    const description = requireText(payload.description, "description", 2, 120);
    const category = optionalText(payload.category, "category", 50) || "general";
    const dueDate = optionalDate(payload.dueDate, "dueDate");
    const shares = resolveShares(data, household.id, amountCents, payload);
    const expense = {
      id: nextId(data, "expenses"),
      householdId: household.id,
      description,
      category,
      amountCents,
      paymentStatus,
      paidByUserId: paidBy?.userId || null,
      dueDate,
      createdAt: now(),
    };
    data.expenses.push(expense);
    for (const share of shares) {
      data.expenseShares.push({ id: nextId(data, "expenseShares"), expenseId: expense.id, userId: share.userId, amountCents: share.amountCents });
    }
    return serializeExpense(expense, data);
  });
}

export async function listExpenses(store, householdId, actorUserId = null) {
  const data = await store.read();
  const household = assertHousehold(data, householdId);
  assertActorMembership(data, household.id, actorUserId);
  return data.expenses
    .filter((expense) => expense.householdId === household.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((expense) => serializeExpense(expense, data));
}

export async function markExpensePaid(store, householdId, expenseId, payload, actorUserId = null) {
  payload = requireObject(payload);
  return store.mutate((data) => {
    const household = assertHousehold(data, householdId);
    assertActorMembership(data, household.id, actorUserId);
    const expense = data.expenses.find((item) => item.id === expenseId && item.householdId === household.id);
    if (!expense) throw notFound("Expense", expenseId);
    if (expensePaymentStatus(expense) === "paid") throw conflict(`${expense.description} is already marked as paid.`);
    const paidBy = assertMember(data, household.id, payload.paidByUserId);
    expense.paymentStatus = "paid";
    expense.paidByUserId = paidBy.userId;
    expense.paidAt = now();
    return serializeExpense(expense, data);
  });
}

export async function recordPayment(store, householdId, payload, actorUserId = null) {
  payload = requireObject(payload);
  return store.mutate((data) => {
    const household = assertHousehold(data, householdId);
    assertActorMembership(data, household.id, actorUserId);
    const fromMember = assertMember(data, household.id, payload.fromUserId);
    const toMember = assertMember(data, household.id, payload.toUserId);
    if (fromMember.userId === toMember.userId) throw new RentSplitError("fromUserId and toUserId must be different users.");
    const payment = {
      id: nextId(data, "payments"),
      householdId: household.id,
      fromUserId: fromMember.userId,
      toUserId: toMember.userId,
      amountCents: toCents(payload.amount, "amount"),
      note: optionalText(payload.note, "note", 160),
      paidAt: now(),
    };
    data.payments.push(payment);
    return serializePayment(payment, data);
  });
}

export async function listPayments(store, householdId, actorUserId = null) {
  const data = await store.read();
  const household = assertHousehold(data, householdId);
  assertActorMembership(data, household.id, actorUserId);
  return data.payments
    .filter((payment) => payment.householdId === household.id)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .map((payment) => serializePayment(payment, data));
}

export async function calculateBalances(store, householdId, actorUserId = null) {
  const data = await store.read();
  const household = assertHousehold(data, householdId);
  assertActorMembership(data, household.id, actorUserId);
  return buildBalanceResponse(data, household);
}

export async function getReminderDigest(store, householdId, options = {}, actorUserId = null) {
  options = requireObject(options, "options");
  const data = await store.read();
  const household = assertHousehold(data, householdId);
  assertActorMembership(data, household.id, actorUserId);
  const asOf = optionalDate(options.asOf, "asOf") || today();
  const balances = buildBalanceResponse(data, household);
  const dueExpenseIds = new Set(
    data.expenses
      .filter((expense) => expense.householdId === household.id)
      .filter((expense) => expensePaymentStatus(expense) === "paid" && expense.dueDate && expense.dueDate <= asOf)
      .map((expense) => expense.id),
  );
  const settlementReminders = balances.settlements.map((settlement) => ({
    type: "settlement",
    householdId: household.id,
    userId: settlement.fromUserId,
    userName: settlement.fromUserName,
    channel: "email",
    amount: settlement.amount,
    currency: household.currency,
    message: `${settlement.fromUserName} owes ${settlement.toUserName} ${household.currency} ${settlement.amount}.`,
    dueExpenseIds: findDueExpenseIdsForUser(data, dueExpenseIds, settlement.fromUserId),
  }));
  const unpaidReminders = data.expenses
    .filter((expense) => expense.householdId === household.id)
    .filter((expense) => expensePaymentStatus(expense) === "unpaid" && expense.dueDate && expense.dueDate <= asOf)
    .flatMap((expense) => data.expenseShares.filter((share) => share.expenseId === expense.id).map((share) => {
      const user = assertUser(data, share.userId);
      return {
        type: "unpaid_bill",
        householdId: household.id,
        userId: user.id,
        userName: user.name,
        channel: "email",
        amount: centsToMoney(share.amountCents),
        currency: household.currency,
        message: `${user.name} still needs to pay ${household.currency} ${centsToMoney(share.amountCents)} for ${expense.description}.`,
        dueExpenseIds: [expense.id],
      };
    }));
  const reminders = [...settlementReminders, ...unpaidReminders];
  return { household: serializeHouseholdSummary(household), asOf, count: reminders.length, reminders };
}

function resolveShares(data, householdId, amountCents, payload) {
  const hasExactSplits = payload.splits !== undefined;
  const hasParticipants = payload.participantUserIds !== undefined;
  if (hasExactSplits && hasParticipants) {
    throw new RentSplitError("Use either splits or participantUserIds, not both.");
  }
  if (hasExactSplits) {
    if (!Array.isArray(payload.splits) || payload.splits.length === 0) {
      throw new RentSplitError("splits must contain at least one split.");
    }
    const seen = new Set();
    const shares = payload.splits.map((split) => {
      split = requireObject(split, "split");
      const member = assertMember(data, householdId, split.userId);
      if (seen.has(member.userId)) throw new RentSplitError(`Duplicate split for user ${member.userId}.`);
      seen.add(member.userId);
      return { userId: member.userId, amountCents: toCents(split.amount, "split amount") };
    });
    const total = shares.reduce((sum, share) => sum + share.amountCents, 0);
    if (total !== amountCents) throw new RentSplitError("Exact split amounts must add up to the expense amount.");
    return shares;
  }
  if (hasParticipants && (!Array.isArray(payload.participantUserIds) || payload.participantUserIds.length === 0)) {
    throw new RentSplitError("participantUserIds must contain at least one user.");
  }
  const participantIds = hasParticipants
    ? payload.participantUserIds
    : data.memberships.filter((member) => member.householdId === householdId).map((member) => member.userId);
  const uniqueParticipantIds = [...new Set(participantIds)];
  if (uniqueParticipantIds.length !== participantIds.length) {
    throw new RentSplitError("participantUserIds must not contain duplicates.");
  }
  for (const userId of uniqueParticipantIds) assertMember(data, householdId, userId);
  return splitEvenly(amountCents, uniqueParticipantIds);
}

function buildBalanceResponse(data, household) {
  const members = data.memberships.filter((member) => member.householdId === household.id);
  const balances = new Map(members.map((member) => [member.userId, 0]));
  const expenses = data.expenses.filter((expense) => expense.householdId === household.id && expensePaymentStatus(expense) === "paid");
  const expenseIds = new Set(expenses.map((expense) => expense.id));
  const shares = data.expenseShares.filter((share) => expenseIds.has(share.expenseId));
  const payments = data.payments.filter((payment) => payment.householdId === household.id);
  for (const expense of expenses) balances.set(expense.paidByUserId, (balances.get(expense.paidByUserId) || 0) + expense.amountCents);
  for (const share of shares) balances.set(share.userId, (balances.get(share.userId) || 0) - share.amountCents);
  for (const payment of payments) {
    balances.set(payment.fromUserId, (balances.get(payment.fromUserId) || 0) + payment.amountCents);
    balances.set(payment.toUserId, (balances.get(payment.toUserId) || 0) - payment.amountCents);
  }
  const memberBalances = members
    .map((member) => {
      const user = assertUser(data, member.userId);
      const balanceCents = balances.get(member.userId) || 0;
      return {
        userId: user.id,
        userName: user.name,
        balance: centsToMoney(balanceCents),
        balanceCents,
        status: balanceCents > 0 ? "gets_back" : balanceCents < 0 ? "owes" : "settled",
      };
    })
    .sort((a, b) => a.userName.localeCompare(b.userName));
  return {
    household: serializeHouseholdSummary(household),
    currency: household.currency,
    members: memberBalances.map(({ balanceCents, ...member }) => member),
    settlements: buildSettlements(memberBalances),
  };
}

function buildSettlements(memberBalances) {
  const debtors = memberBalances
    .filter((member) => member.balanceCents < 0)
    .map((member) => ({ ...member, remainingCents: Math.abs(member.balanceCents) }))
    .sort((a, b) => b.remainingCents - a.remainingCents);
  const creditors = memberBalances
    .filter((member) => member.balanceCents > 0)
    .map((member) => ({ ...member, remainingCents: member.balanceCents }))
    .sort((a, b) => b.remainingCents - a.remainingCents);
  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.remainingCents, creditor.remainingCents);
    settlements.push({
      fromUserId: debtor.userId,
      fromUserName: debtor.userName,
      toUserId: creditor.userId,
      toUserName: creditor.userName,
      amount: centsToMoney(amountCents),
    });
    debtor.remainingCents -= amountCents;
    creditor.remainingCents -= amountCents;
    if (debtor.remainingCents === 0) debtorIndex += 1;
    if (creditor.remainingCents === 0) creditorIndex += 1;
  }
  return settlements;
}

function findDueExpenseIdsForUser(data, dueExpenseIds, userId) {
  return data.expenseShares
    .filter((share) => dueExpenseIds.has(share.expenseId) && share.userId === userId)
    .map((share) => share.expenseId);
}

function serializeUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone || null, createdAt: user.createdAt };
}

function serializeHousehold(household, data) {
  return {
    ...serializeHouseholdSummary(household),
    members: data.memberships
      .filter((member) => member.householdId === household.id)
      .map((member) => serializeMembership(member, data)),
  };
}

function serializeHouseholdSummary(household) {
  return { id: household.id, name: household.name, currency: household.currency, createdAt: household.createdAt };
}

function serializeMembership(membership, data) {
  const user = assertUser(data, membership.userId);
  return {
    id: membership.id,
    householdId: membership.householdId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    role: membership.role,
    joinedAt: membership.joinedAt,
  };
}

function serializeExpense(expense, data) {
  const paymentStatus = expensePaymentStatus(expense);
  const paidBy = paymentStatus === "paid" ? assertUser(data, expense.paidByUserId) : null;
  const shares = data.expenseShares
    .filter((share) => share.expenseId === expense.id)
    .map((share) => {
      const user = assertUser(data, share.userId);
      return { userId: user.id, userName: user.name, amount: centsToMoney(share.amountCents) };
    });
  return {
    id: expense.id,
    householdId: expense.householdId,
    description: expense.description,
    category: expense.category,
    amount: centsToMoney(expense.amountCents),
    paymentStatus,
    paidByUserId: paidBy?.id || null,
    paidByUserName: paidBy?.name || null,
    dueDate: expense.dueDate,
    paidAt: expense.paidAt || null,
    shares,
    createdAt: expense.createdAt,
  };
}

function serializePayment(payment, data) {
  const fromUser = assertUser(data, payment.fromUserId);
  const toUser = assertUser(data, payment.toUserId);
  return {
    id: payment.id,
    householdId: payment.householdId,
    fromUserId: fromUser.id,
    fromUserName: fromUser.name,
    toUserId: toUser.id,
    toUserName: toUser.name,
    amount: centsToMoney(payment.amountCents),
    note: payment.note,
    paidAt: payment.paidAt,
  };
}

function assertHousehold(data, householdId) {
  const household = data.households.find((candidate) => candidate.id === householdId);
  if (!household) throw notFound("Household", householdId);
  return household;
}

function assertUser(data, userId) {
  const user = data.users.find((candidate) => candidate.id === userId);
  if (!user) throw notFound("User", userId);
  return user;
}

function assertMember(data, householdId, userId) {
  assertUser(data, userId);
  const member = data.memberships.find((candidate) => candidate.householdId === householdId && candidate.userId === userId);
  if (!member) {
    throw new RentSplitError(`User ${userId} is not a member of household ${householdId}.`, {
      status: 403,
      code: "not_household_member",
    });
  }
  return member;
}

function assertActorMembership(data, householdId, actorUserId, { ownerOnly = false } = {}) {
  if (!actorUserId) return null;
  const membership = assertMember(data, householdId, actorUserId);
  if (ownerOnly && membership.role !== "owner") {
    throw new RentSplitError("Only a household owner can add roommates.", {
      status: 403,
      code: "owner_required",
    });
  }
  return membership;
}

function expensePaymentStatus(expense) {
  return expense.paymentStatus === "unpaid" ? "unpaid" : "paid";
}

function requireText(value, fieldName, minLength, maxLength) {
  if (typeof value !== "string") throw new RentSplitError(`${fieldName} is required.`);
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new RentSplitError(`${fieldName} must be ${minLength}-${maxLength} characters.`);
  }
  return normalized;
}

function requireObject(value, fieldName = "request body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RentSplitError(`${fieldName} must be a JSON object.`);
  }
  return value;
}

function optionalText(value, fieldName, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new RentSplitError(`${fieldName} must be text.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new RentSplitError(`${fieldName} must be ${maxLength} characters or fewer.`);
  return normalized || null;
}

function normalizeEmail(value) {
  const email = requireText(value, "email", 5, 120).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new RentSplitError("email must be a valid email address.");
  return email;
}

function normalizeCurrency(value) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RentSplitError("currency must be a 3-letter ISO code like NGN or USD.");
  }
  return currency;
}

function optionalDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RentSplitError(`${fieldName} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RentSplitError(`${fieldName} must be a real calendar date.`);
  }
  return value;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function now() {
  return new Date().toISOString();
}
