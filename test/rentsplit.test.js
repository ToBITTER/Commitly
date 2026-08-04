import test from "node:test";
import assert from "node:assert/strict";
import {
  addMember,
  calculateBalances,
  createExpense,
  createHousehold,
  createUser,
  getReminderDigest,
  markExpensePaid,
  recordPayment,
} from "../src/services/rentsplit.js";
import { MemoryStore } from "../src/store.js";

async function seedThreeRoommates() {
  const store = new MemoryStore();
  const ada = await createUser(store, { name: "Ada", email: "ada@example.com" });
  const ben = await createUser(store, { name: "Ben", email: "ben@example.com" });
  const chi = await createUser(store, { name: "Chi", email: "chi@example.com" });
  const household = await createHousehold(store, { name: "Flat 4B", currency: "NGN", createdByUserId: ada.id });
  await addMember(store, household.id, { userId: ben.id });
  await addMember(store, household.id, { userId: chi.id });
  return { store, ada, ben, chi, household };
}

test("splits a shared rent expense and calculates who owes who", async () => {
  const { store, ada, ben, chi, household } = await seedThreeRoommates();
  await createExpense(store, household.id, {
    description: "August rent",
    amount: "900000.00",
    paidByUserId: ada.id,
    participantUserIds: [ada.id, ben.id, chi.id],
    dueDate: "2026-08-05",
    category: "rent",
  });
  const balances = await calculateBalances(store, household.id);
  assert.deepEqual(
    balances.members.map((member) => [member.userName, member.balance, member.status]),
    [
      ["Ada", "600000.00", "gets_back"],
      ["Ben", "-300000.00", "owes"],
      ["Chi", "-300000.00", "owes"],
    ],
  );
  assert.deepEqual(
    balances.settlements.map((settlement) => [settlement.fromUserName, settlement.toUserName, settlement.amount]),
    [
      ["Ben", "Ada", "300000.00"],
      ["Chi", "Ada", "300000.00"],
    ],
  );
});

test("records settlement payments and reduces outstanding balances", async () => {
  const { store, ada, ben, chi, household } = await seedThreeRoommates();
  await createExpense(store, household.id, {
    description: "Electricity",
    amount: "15000.00",
    paidByUserId: ada.id,
    participantUserIds: [ada.id, ben.id, chi.id],
  });
  await recordPayment(store, household.id, {
    fromUserId: ben.id,
    toUserId: ada.id,
    amount: "5000.00",
    note: "Ben paid his electricity share",
  });
  const balances = await calculateBalances(store, household.id);
  assert.deepEqual(
    balances.members.map((member) => [member.userName, member.balance, member.status]),
    [
      ["Ada", "5000.00", "gets_back"],
      ["Ben", "0.00", "settled"],
      ["Chi", "-5000.00", "owes"],
    ],
  );
  assert.equal(balances.settlements.length, 1);
  assert.equal(balances.settlements[0].fromUserName, "Chi");
});

test("supports exact custom split amounts", async () => {
  const { store, ada, ben, chi, household } = await seedThreeRoommates();
  const expense = await createExpense(store, household.id, {
    description: "Internet",
    amount: "12000.00",
    paidByUserId: ben.id,
    splits: [
      { userId: ada.id, amount: "4000.00" },
      { userId: ben.id, amount: "4000.00" },
      { userId: chi.id, amount: "4000.00" },
    ],
  });
  assert.deepEqual(
    expense.shares.map((share) => [share.userName, share.amount]),
    [
      ["Ada", "4000.00"],
      ["Ben", "4000.00"],
      ["Chi", "4000.00"],
    ],
  );
});

test("tracks an unpaid bill without changing balances until someone covers it", async () => {
  const { store, ada, ben, household } = await seedThreeRoommates();
  const expense = await createExpense(store, household.id, {
    description: "Internet renewal",
    amount: "12000.00",
    paymentStatus: "unpaid",
    participantUserIds: [ada.id, ben.id],
    dueDate: "2026-08-01",
  });

  assert.equal(expense.paymentStatus, "unpaid");
  assert.equal(expense.paidByUserId, null);
  const unpaidBalances = await calculateBalances(store, household.id);
  assert.equal(unpaidBalances.settlements.length, 0);
  assert.ok(unpaidBalances.members.every((member) => member.status === "settled"));

  const digest = await getReminderDigest(store, household.id, { asOf: "2026-08-04" });
  assert.equal(digest.count, 2);
  assert.ok(digest.reminders.every((reminder) => reminder.type === "unpaid_bill"));

  const covered = await markExpensePaid(store, household.id, expense.id, { paidByUserId: ada.id });
  assert.equal(covered.paymentStatus, "paid");
  assert.equal(covered.paidByUserId, ada.id);
  const paidBalances = await calculateBalances(store, household.id);
  assert.deepEqual(paidBalances.settlements.map((settlement) => [settlement.fromUserId, settlement.toUserId, settlement.amount]), [
    [ben.id, ada.id, "6000.00"],
  ]);
});

test("builds reminder digest from outstanding settlements", async () => {
  const { store, ada, ben, household } = await seedThreeRoommates();
  await createExpense(store, household.id, {
    description: "Water bill",
    amount: "6000.00",
    paidByUserId: ada.id,
    participantUserIds: [ada.id, ben.id],
    dueDate: "2026-08-01",
  });
  const digest = await getReminderDigest(store, household.id, { asOf: "2026-08-03" });
  assert.equal(digest.count, 1);
  assert.equal(digest.reminders[0].userName, "Ben");
  assert.match(digest.reminders[0].message, /Ben owes Ada NGN 3000\.00/);
  assert.deepEqual(digest.reminders[0].dueExpenseIds, ["exp_1"]);
});

test("rejects impossible calendar dates", async () => {
  const { store, ada, household } = await seedThreeRoommates();
  await assert.rejects(
    createExpense(store, household.id, {
      description: "Invalid bill",
      amount: "1000.00",
      paidByUserId: ada.id,
      participantUserIds: [ada.id],
      dueDate: "2026-02-30",
    }),
    /dueDate must be a real calendar date/,
  );
});

test("serializes concurrent writes without losing records", async () => {
  const store = new MemoryStore();
  await Promise.all(
    Array.from({ length: 20 }, (_, index) => createUser(store, {
      name: `Roommate ${index}`,
      email: `roommate${index}@example.com`,
    })),
  );
  const data = await store.read();
  assert.equal(data.users.length, 20);
  assert.equal(new Set(data.users.map((user) => user.id)).size, 20);
});
