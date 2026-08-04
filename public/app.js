const state = {
  session: {
    authenticationRequired: false,
    emailNotificationsEnabled: false,
    user: null,
  },
  users: [],
  households: [],
  activeHousehold: null,
  expenses: [],
  balances: null,
  reminders: null,
  payments: [],
  view: "overview",
};

const THEME_STORAGE_KEY = "rentsplit-theme";

const viewCopy = {
  overview: { title: "Overview", eyebrow: "Your shared home" },
  expenses: { title: "Expenses", eyebrow: "Track every shared cost" },
  people: { title: "People", eyebrow: "Everyone under one roof" },
  settle: { title: "Settle up", eyebrow: "Bring every balance to zero" },
};

const elements = {
  accountAvatar: document.querySelector("#account-avatar"),
  accountChip: document.querySelector("#account-chip"),
  accountEmail: document.querySelector("#account-email"),
  accountName: document.querySelector("#account-name"),
  appShell: document.querySelector("#app-shell"),
  authBack: document.querySelector("#auth-back"),
  authCopy: document.querySelector("#auth-copy"),
  authForm: document.querySelector("#auth-form"),
  authMessage: document.querySelector("#auth-message"),
  authProgress: document.querySelector("#auth-progress"),
  authProgressDots: [...document.querySelectorAll(".auth-progress-dots i")],
  authScreen: document.querySelector("#auth-screen"),
  authStepLabel: document.querySelector("#auth-step-label"),
  authSteps: [...document.querySelectorAll("[data-auth-step]")],
  authTitle: document.querySelector("#auth-title"),
  authToggle: document.querySelector("#auth-toggle"),
  coverExpenseName: document.querySelector("#cover-expense-name"),
  coverForm: document.querySelector("#cover-form"),
  coverPayer: document.querySelector("#cover-payer"),
  dashboard: document.querySelector("#dashboard"),
  expenseCurrency: document.querySelector("#expense-currency"),
  expenseForm: document.querySelector("#expense-form"),
  expenseParticipants: document.querySelector("#expense-participants"),
  expensePayer: document.querySelector("#expense-payer"),
  expenseSearch: document.querySelector("#expense-search"),
  expenseTable: document.querySelector("#expense-table"),
  existingPersonField: document.querySelector("#existing-person-field"),
  existingUser: document.querySelector("#existing-user"),
  heroAmount: document.querySelector("#hero-amount"),
  heroMessage: document.querySelector("#hero-message"),
  householdForm: document.querySelector("#household-form"),
  householdNote: document.querySelector("#household-note"),
  householdOwner: document.querySelector("#household-owner"),
  householdSelect: document.querySelector("#household-select"),
  loadingState: document.querySelector("#loading-state"),
  mobileMenu: document.querySelector("#mobile-menu"),
  mobileNav: document.querySelector("#mobile-nav"),
  newPersonFields: document.querySelector("#new-person-fields"),
  paymentCurrency: document.querySelector("#payment-currency"),
  paymentForm: document.querySelector("#payment-form"),
  paymentFrom: document.querySelector("#payment-from"),
  paymentTo: document.querySelector("#payment-to"),
  personDialogCopy: document.querySelector("#person-dialog-copy"),
  personDialogTitle: document.querySelector("#person-dialog-title"),
  personForm: document.querySelector("#person-form"),
  personRoleField: document.querySelector("#person-role-field"),
  setupActions: document.querySelector("#setup-actions"),
  setupCopy: document.querySelector("#setup-copy"),
  setupState: document.querySelector("#setup-state"),
  setupTitle: document.querySelector("#setup-title"),
  sendReminders: document.querySelector("#send-reminders"),
  signOut: document.querySelector("#sign-out"),
  sidebar: document.querySelector("#sidebar"),
  syncState: document.querySelector("#sync-state"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  themeToggle: document.querySelector("#theme-toggle"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toast-message"),
  viewEyebrow: document.querySelector("#view-eyebrow"),
  viewTitle: document.querySelector("#view-title"),
};

let toastTimer;
let authMode = "sign-up";
let authStep = 0;

const signUpStepCopy = [
  { title: "What should we call you?", copy: "Start with your name so your roommates know it is you." },
  { title: "What is your email?", copy: "Use the email address you want connected to your households." },
  { title: "Create a password", copy: "Use at least 8 characters to keep your account secure." },
  { title: "Confirm your password", copy: "Enter it once more, then your account is ready." },
];

document.addEventListener("click", handleDocumentClick);
elements.householdSelect.addEventListener("change", () => loadHousehold(elements.householdSelect.value));
elements.mobileMenu.addEventListener("click", toggleSidebar);
elements.expenseSearch.addEventListener("input", renderExpenseTable);
elements.existingUser.addEventListener("change", updatePersonMode);
elements.authForm.addEventListener("submit", handleAuthSubmit);
elements.authBack.addEventListener("click", () => {
  elements.authMessage.textContent = "";
  setAuthStep(authStep - 1);
});
elements.authForm.elements.confirmPassword.addEventListener("input", () => {
  elements.authForm.elements.confirmPassword.setCustomValidity("");
});
elements.authToggle.addEventListener("click", () => {
  elements.authMessage.textContent = "";
  setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up");
});
elements.coverForm.addEventListener("submit", (event) => submitForm(event, saveCoveredExpense));
elements.personForm.addEventListener("submit", (event) => submitForm(event, savePerson));
elements.householdForm.addEventListener("submit", (event) => submitForm(event, saveHousehold));
elements.expenseForm.addEventListener("submit", (event) => submitForm(event, saveExpense));
elements.paymentForm.addEventListener("submit", (event) => submitForm(event, savePayment));
elements.sendReminders.addEventListener("click", sendReminderEmails);
elements.signOut.addEventListener("click", signOut);
elements.themeToggle.addEventListener("click", toggleTheme);

applyTheme(readStoredTheme());

for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

initialize();

async function initialize() {
  setView("overview");
  try {
    state.session = await api("/session");
    if (state.session.authenticationRequired && !state.session.user) {
      showAuthScreen();
      return;
    }
    showApplication();
    await refreshBaseData();
    setSync("online", "All changes saved securely");
  } catch (error) {
    showApplication();
    showStartupError(error);
  } finally {
    elements.loadingState.classList.add("is-hidden");
  }
}

function showApplication() {
  elements.authScreen.classList.add("is-hidden");
  elements.appShell.classList.remove("is-hidden");
  elements.mobileNav.classList.remove("is-hidden");
  renderAccount();
}

function showAuthScreen(message = "") {
  elements.appShell.classList.add("is-hidden");
  elements.mobileNav.classList.add("is-hidden");
  elements.authScreen.classList.remove("is-hidden");
  elements.authMessage.textContent = message;
  setAuthMode("sign-up");
}

function renderAccount() {
  const user = state.session.user;
  elements.accountChip.classList.toggle("is-hidden", !state.session.authenticationRequired || !user);
  if (!user) return;
  elements.accountAvatar.textContent = initials(user.name);
  elements.accountName.textContent = user.name;
  elements.accountEmail.textContent = user.email;
}

async function refreshBaseData(preferredHouseholdId = null) {
  const [users, households] = await Promise.all([api("/users"), api("/households")]);
  state.users = users;
  state.households = households;
  renderHouseholdSelect();

  const rememberedHouseholdId = preferredHouseholdId || readStoredHouseholdId();
  const activeId = households.some((household) => household.id === rememberedHouseholdId)
    ? rememberedHouseholdId
    : households[0]?.id;

  if (activeId) {
    await loadHousehold(activeId, { quiet: true });
  } else {
    clearHouseholdState();
    renderApp();
  }
}

async function loadHousehold(householdId, { quiet = false } = {}) {
  if (!householdId) {
    clearHouseholdState();
    renderApp();
    return;
  }

  if (!quiet) setSync("loading", "Loading household…");
  try {
    const asOf = localDateString();
    const encodedId = encodeURIComponent(householdId);
    const [household, expenses, balances, reminders, payments] = await Promise.all([
      api(`/households/${encodedId}`),
      api(`/households/${encodedId}/expenses`),
      api(`/households/${encodedId}/balances`),
      api(`/households/${encodedId}/reminders?asOf=${asOf}`),
      api(`/households/${encodedId}/payments`),
    ]);
    state.activeHousehold = household;
    state.expenses = expenses;
    state.balances = balances;
    state.reminders = reminders;
    state.payments = payments;
    storeHouseholdId(householdId);
    renderApp();
    setSync("online", "All changes saved securely");
  } catch (error) {
    setSync("error", "Could not load household");
    showToast(error.message, true);
  }
}

function clearHouseholdState() {
  state.activeHousehold = null;
  state.expenses = [];
  state.balances = null;
  state.reminders = null;
  state.payments = [];
}

function clearAccountState() {
  state.users = [];
  state.households = [];
  clearHouseholdState();
}

function renderApp() {
  renderHouseholdSelect();
  const hasHousehold = Boolean(state.activeHousehold);
  const currentMembership = state.activeHousehold?.members.find((member) => member.userId === state.session.user?.id);
  const canInvite = !state.session.authenticationRequired || currentMembership?.role === "owner";
  elements.dashboard.classList.toggle("is-hidden", !hasHousehold);
  elements.setupState.classList.toggle("is-hidden", hasHousehold);

  for (const button of document.querySelectorAll('[data-open-dialog="expense-dialog"], [data-open-dialog="payment-dialog"]')) {
    button.disabled = !hasHousehold;
  }
  for (const button of document.querySelectorAll('[data-open-dialog="person-dialog"]')) {
    button.disabled = state.session.authenticationRequired ? !hasHousehold || !canInvite : false;
  }

  if (!hasHousehold) {
    renderSetup();
    return;
  }

  renderDashboard();
  setView(state.view);
}

function renderSetup() {
  const hasUsers = state.users.length > 0;
  elements.setupTitle.textContent = hasUsers ? "Your profile is ready" : "Let’s set up your home";
  elements.setupCopy.textContent = hasUsers
    ? "Create your first household, choose its currency, and start splitting shared costs."
    : "Create your profile first, then start a household and invite your roommates.";
  elements.setupActions.innerHTML = hasUsers
    ? `<button class="button button-primary" type="button" data-open-dialog="household-dialog"><svg class="icon"><use href="#icon-building"/></svg>Create household</button>${state.session.authenticationRequired ? "" : '<button class="button button-secondary" type="button" data-open-dialog="person-dialog"><svg class="icon"><use href="#icon-plus"/></svg>Add another person</button>'}`
    : `<button class="button button-primary" type="button" data-open-dialog="person-dialog"><svg class="icon"><use href="#icon-users"/></svg>Create your profile</button>`;
}

function renderDashboard() {
  const household = state.activeHousehold;
  const currency = household.currency;
  const settlements = state.balances?.settlements || [];
  const outstanding = settlements.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalSpend = state.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const unpaidCount = state.expenses.filter((expense) => expense.paymentStatus === "unpaid").length;
  const memberCount = household.members.length;

  elements.viewEyebrow.textContent = household.name;
  elements.heroAmount.textContent = formatMoney(outstanding, currency);
  elements.heroMessage.textContent = outstanding > 0
    ? `${plural(settlements.length, "payment")} will settle everyone up.`
    : unpaidCount
      ? `${plural(unpaidCount, "bill")} still waiting to be paid.`
      : "Everyone is settled up. Nice work.";
  elements.expenseCurrency.textContent = currency;
  elements.paymentCurrency.textContent = currency;
  document.querySelector("#settlement-count").textContent = plural(settlements.length, "payment");
  document.querySelector("#as-of-date").textContent = formatDate(localDateString());
  const currentMembership = household.members.find((member) => member.userId === state.session.user?.id);
  elements.sendReminders.disabled = !state.session.emailNotificationsEnabled || !state.reminders?.count || (state.session.authenticationRequired && currentMembership?.role !== "owner");
  elements.sendReminders.title = state.session.emailNotificationsEnabled ? "Send every current reminder by email" : "Add Resend settings to enable email notifications";

  document.querySelector("#stat-grid").innerHTML = [
    statCard("receipt", "Shared spend", formatMoney(totalSpend, currency), plural(state.expenses.length, "expense"), ""),
    statCard("settle", "Outstanding", formatMoney(outstanding, currency), settlements.length ? "Ready to settle" : "Nothing owed", "is-green"),
    statCard("users", "Roommates", String(memberCount), memberCount === 1 ? "Add someone to split with" : "Active household members", "is-blue"),
  ].join("");

  renderRecentExpenses();
  renderSettlementPreview();
  renderReminders();
  renderExpenseTable();
  renderPeople();
  renderSettlementList();
  renderPaymentHistory();
}

function renderRecentExpenses() {
  const container = document.querySelector("#recent-expenses");
  if (!state.expenses.length) {
    container.innerHTML = emptyBlock("receipt", "No expenses yet", "Add your first shared cost and RentSplit will handle the maths.");
    return;
  }
  container.innerHTML = `<div class="expense-list">${state.expenses.slice(0, 4).map(expenseRow).join("")}</div>`;
}

function renderSettlementPreview() {
  const container = document.querySelector("#settlement-preview");
  const settlements = state.balances?.settlements || [];
  if (!settlements.length) {
    container.innerHTML = emptyBlock("check", "All settled", "There are no outstanding payments in this household.");
    return;
  }
  container.innerHTML = `<div class="settlement-stack">${settlements.slice(0, 4).map((settlement) => settlementRow(settlement)).join("")}</div>`;
}

function renderReminders() {
  const container = document.querySelector("#reminder-list");
  const reminders = state.reminders?.reminders || [];
  if (!reminders.length) {
    container.innerHTML = `<div class="reminder-item"><svg class="icon"><use href="#icon-check"/></svg><div><strong>No reminders needed</strong><p>Your household has no outstanding balances today.</p></div></div>`;
    return;
  }
  container.innerHTML = reminders.slice(0, 3).map((reminder) => {
    const message = reminder.message.replace(`${reminder.currency} ${reminder.amount}`, formatMoney(reminder.amount, reminder.currency));
    return `
      <div class="reminder-item">
        <svg class="icon"><use href="#icon-bell"/></svg>
        <div><strong>${escapeHtml(reminder.userName)}</strong><p>${escapeHtml(message)}${reminder.dueExpenseIds.length ? ` ${plural(reminder.dueExpenseIds.length, "due expense")} included.` : ""}</p></div>
      </div>
    `;
  }).join("");
}

function renderExpenseTable() {
  if (!state.activeHousehold) return;
  const query = elements.expenseSearch.value.trim().toLowerCase();
  const expenses = state.expenses.filter((expense) => {
    if (!query) return true;
    return [expense.description, expense.category, expense.paidByUserName || "", expense.paymentStatus].some((value) => value.toLowerCase().includes(query));
  });

  if (!expenses.length) {
    elements.expenseTable.innerHTML = emptyBlock("search", query ? "No matching expenses" : "No expenses yet", query ? "Try a different search term." : "Add the first shared cost for this household.");
    return;
  }

  elements.expenseTable.innerHTML = `
    <div class="expense-table-header"><span>Expense</span><span>Paid by</span><span>Split between</span><span>Amount</span></div>
    <div>${expenses.map((expense) => `
      <div class="expense-table-row">
        <div class="table-expense">
          <span class="expense-icon category-${safeCategory(expense.category)}">${categoryGlyph(expense.category)}</span>
          <div><strong>${escapeHtml(expense.description)}</strong><span>${formatDate(expense.createdAt)}</span>${expense.paymentStatus === "unpaid" ? `<span class="mobile-expense-status payment-state-badge is-unpaid">Not paid <button class="table-action" type="button" data-cover-expense="${escapeHtml(expense.id)}">Mark paid</button></span>` : ""}</div>
        </div>
        <span class="payment-state">${expense.paymentStatus === "unpaid" ? `<span class="payment-state-badge is-unpaid">Not paid yet</span><button class="table-action" type="button" data-cover-expense="${escapeHtml(expense.id)}">Mark as paid</button>` : `<span class="payment-state-badge">${escapeHtml(expense.paidByUserName)}</span>`}</span>
        <span class="table-muted">${plural(expense.shares.length, "person", "people")}</span>
        <strong class="table-amount">${formatMoney(expense.amount, state.activeHousehold.currency)}</strong>
      </div>
    `).join("")}</div>
  `;
}

function renderPeople() {
  const container = document.querySelector("#people-grid");
  const balanceMap = new Map((state.balances?.members || []).map((member) => [member.userId, member]));
  container.innerHTML = state.activeHousehold.members.map((member) => {
    const balance = balanceMap.get(member.userId) || { balance: "0.00", status: "settled" };
    const amountClass = balance.status === "gets_back" ? "is-positive" : balance.status === "owes" ? "is-negative" : "";
    const balanceLabel = balance.status === "gets_back" ? "Gets back" : balance.status === "owes" ? "Owes" : "Settled";
    return `
      <article class="person-card">
        <div class="person-top">
          <span class="avatar">${initials(member.userName)}</span>
          <div><strong>${escapeHtml(member.userName)}</strong><span>${escapeHtml(member.userEmail)}</span></div>
          <span class="role-badge">${escapeHtml(member.role)}</span>
        </div>
        <div class="person-balance"><span>${balanceLabel}</span><strong class="${amountClass}">${formatMoney(Math.abs(Number(balance.balance)), state.activeHousehold.currency)}</strong></div>
      </article>
    `;
  }).join("");
}

function renderSettlementList() {
  const container = document.querySelector("#settlement-list");
  const settlements = state.balances?.settlements || [];
  if (!settlements.length) {
    container.innerHTML = emptyBlock("check", "Nothing left to pay", "Every roommate is currently settled.");
    return;
  }
  container.innerHTML = `<div class="settlement-stack">${settlements.map((settlement, index) => settlementRow(settlement, index)).join("")}</div>`;
}

function renderPaymentHistory() {
  const container = document.querySelector("#payment-history");
  if (!state.payments.length) {
    container.innerHTML = emptyBlock("clock", "No payments recorded", "Completed settlement payments will appear here.");
    return;
  }
  container.innerHTML = `<div class="history-stack">${state.payments.map((payment) => `
    <div class="history-row">
      <span class="history-status"><svg class="icon"><use href="#icon-check"/></svg></span>
      <div class="history-main"><strong>${escapeHtml(payment.fromUserName)} paid ${escapeHtml(payment.toUserName)}</strong><span>${formatDate(payment.paidAt)}${payment.note ? ` · ${escapeHtml(payment.note)}` : ""}</span></div>
      <div class="history-amount"><strong>${formatMoney(payment.amount, state.activeHousehold.currency)}</strong><span>Completed</span></div>
    </div>
  `).join("")}</div>`;
}

function expenseRow(expense) {
  const paymentCopy = expense.paymentStatus === "unpaid" ? "Nobody has paid yet" : `Paid by ${escapeHtml(expense.paidByUserName)}`;
  return `
    <div class="expense-row">
      <span class="expense-icon category-${safeCategory(expense.category)}">${categoryGlyph(expense.category)}</span>
      <div class="expense-main"><strong>${escapeHtml(expense.description)}</strong><span>${paymentCopy} · ${formatDate(expense.createdAt)}</span></div>
      <div class="expense-amount"><strong>${formatMoney(expense.amount, state.activeHousehold.currency)}</strong><span>${escapeHtml(expense.category)}</span></div>
    </div>
  `;
}

function settlementRow(settlement, index = null) {
  const recordButton = index === null ? "" : `<button class="record-button" type="button" data-record-settlement="${index}">Record</button>`;
  return `
    <div class="settlement-row">
      <span class="avatar-pair"><span>${initials(settlement.fromUserName)}</span><span>${initials(settlement.toUserName)}</span></span>
      <div class="settlement-main"><strong>${escapeHtml(settlement.fromUserName)} <span class="settlement-arrow">→</span> ${escapeHtml(settlement.toUserName)}</strong><span>One payment clears this balance</span></div>
      <div class="settlement-side"><span class="settlement-amount">${formatMoney(settlement.amount, state.activeHousehold.currency)}</span>${recordButton}</div>
    </div>
  `;
}

function statCard(icon, label, value, meta, iconClass) {
  return `<article class="stat-card"><span class="stat-icon ${iconClass}"><svg class="icon"><use href="#icon-${icon}"/></svg></span><div class="stat-copy"><span class="stat-label">${label}</span><strong class="stat-value">${escapeHtml(value)}</strong><span class="stat-meta">${escapeHtml(meta)}</span></div></article>`;
}

function emptyBlock(icon, title, copy) {
  return `<div class="empty-block"><div><span class="empty-icon"><svg class="icon"><use href="#icon-${icon}"/></svg></span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div></div>`;
}

function renderHouseholdSelect() {
  const currentId = state.activeHousehold?.id || "";
  elements.householdSelect.innerHTML = state.households.length
    ? state.households.map((household) => `<option value="${escapeHtml(household.id)}"${household.id === currentId ? " selected" : ""}>${escapeHtml(household.name)}</option>`).join("")
    : '<option value="">No household yet</option>';
  elements.householdSelect.disabled = !state.households.length;
}

function setView(view) {
  if (!viewCopy[view]) return;
  state.view = view;
  const copy = viewCopy[view];
  elements.viewTitle.textContent = copy.title;
  elements.viewEyebrow.textContent = state.activeHousehold?.name || copy.eyebrow;
  for (const button of document.querySelectorAll("[data-view]")) {
    if (button.closest(".hero-actions") || button.closest(".card-header")) continue;
    button.classList.toggle("is-active", button.dataset.view === view);
  }
  for (const panel of document.querySelectorAll("[data-view-panel]")) {
    panel.classList.toggle("is-hidden", panel.dataset.viewPanel !== view);
  }
  elements.sidebar.classList.remove("is-open");
  elements.mobileMenu.setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleDocumentClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setView(viewButton.dataset.view);
    return;
  }

  const settlementButton = event.target.closest("[data-record-settlement]");
  if (settlementButton) {
    const settlement = state.balances?.settlements[Number(settlementButton.dataset.recordSettlement)];
    openDialog("payment-dialog", settlement);
    return;
  }

  const coverButton = event.target.closest("[data-cover-expense]");
  if (coverButton) {
    const expense = state.expenses.find((item) => item.id === coverButton.dataset.coverExpense);
    if (expense) prepareCoverDialog(expense);
    return;
  }

  const openButton = event.target.closest("[data-open-dialog]");
  if (openButton && !openButton.disabled) {
    openDialog(openButton.dataset.openDialog);
    return;
  }

  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) closeButton.closest("dialog")?.close();
}

function openDialog(dialogId, settlement = null) {
  if (dialogId === "person-dialog" && state.session.authenticationRequired && !state.activeHousehold) {
    showToast("Create a household before inviting a roommate.", true);
    dialogId = "household-dialog";
  }
  if (dialogId === "household-dialog" && !state.users.length) {
    showToast("Create a profile before starting a household.", true);
    dialogId = "person-dialog";
  }
  if ((dialogId === "expense-dialog" || dialogId === "payment-dialog") && !state.activeHousehold) {
    showToast("Create a household first.", true);
    return;
  }
  if (dialogId === "payment-dialog" && state.activeHousehold.members.length < 2) {
    showToast("Add another roommate before recording a payment.", true);
    return;
  }

  if (dialogId === "person-dialog") preparePersonDialog();
  if (dialogId === "household-dialog") prepareHouseholdDialog();
  if (dialogId === "expense-dialog") prepareExpenseDialog();
  if (dialogId === "payment-dialog") preparePaymentDialog(settlement);
  document.querySelector(`#${dialogId}`).showModal();
}

function preparePersonDialog() {
  elements.personForm.reset();
  const members = new Set((state.activeHousehold?.members || []).map((member) => member.userId));
  const availableUsers = state.users.filter((user) => !members.has(user.id));
  const hasHousehold = Boolean(state.activeHousehold);
  elements.personDialogTitle.textContent = hasHousehold ? "Add a roommate" : "Create your profile";
  elements.personDialogCopy.textContent = hasHousehold
    ? state.session.authenticationRequired
      ? "Add their email and we will invite them to this private household."
      : "Add their details to this household."
    : "Add your details to get your household started.";
  elements.personRoleField.classList.toggle("is-hidden", !hasHousehold);
  elements.existingPersonField.classList.toggle("is-hidden", state.session.authenticationRequired || !hasHousehold || !availableUsers.length);
  elements.existingUser.innerHTML = `<option value="new">Create someone new</option>${availableUsers.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} — ${escapeHtml(user.email)}</option>`).join("")}`;
  updatePersonMode();
}

function updatePersonMode() {
  const isNew = elements.existingUser.value === "new" || elements.existingPersonField.classList.contains("is-hidden");
  elements.newPersonFields.classList.toggle("is-hidden", !isNew);
  for (const input of elements.newPersonFields.querySelectorAll("input")) {
    input.required = isNew && input.name !== "phone";
  }
}

function prepareHouseholdDialog() {
  elements.householdForm.reset();
  elements.householdOwner.innerHTML = state.users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} — ${escapeHtml(user.email)}</option>`).join("");
  elements.householdNote.classList.toggle("is-hidden", state.users.length > 0);
  elements.householdForm.querySelector('[type="submit"]').disabled = !state.users.length;
}

function prepareExpenseDialog() {
  elements.expenseForm.reset();
  const members = state.activeHousehold.members;
  const options = members.map((member) => `<option value="${escapeHtml(member.userId)}">${escapeHtml(member.userName)}</option>`).join("");
  elements.expensePayer.innerHTML = options;
  elements.expenseParticipants.innerHTML = members.map((member) => `
    <label class="participant-option"><input type="checkbox" name="participantUserIds" value="${escapeHtml(member.userId)}" checked><span>${escapeHtml(member.userName)}</span></label>
  `).join("");
  elements.expenseCurrency.textContent = state.activeHousehold.currency;
  const currentMember = members.find((member) => member.userId === state.session.user?.id);
  if (currentMember) elements.expensePayer.value = currentMember.userId;
}

function prepareCoverDialog(expense) {
  elements.coverForm.reset();
  elements.coverForm.dataset.expenseId = expense.id;
  elements.coverExpenseName.textContent = `${expense.description} · ${formatMoney(expense.amount, state.activeHousehold.currency)}`;
  elements.coverPayer.innerHTML = state.activeHousehold.members.map((member) => `<option value="${escapeHtml(member.userId)}">${escapeHtml(member.userName)}</option>`).join("");
  if (state.session.user && state.activeHousehold.members.some((member) => member.userId === state.session.user.id)) {
    elements.coverPayer.value = state.session.user.id;
  }
  document.querySelector("#cover-dialog").showModal();
}

function preparePaymentDialog(settlement) {
  elements.paymentForm.reset();
  const options = state.activeHousehold.members.map((member) => `<option value="${escapeHtml(member.userId)}">${escapeHtml(member.userName)}</option>`).join("");
  elements.paymentFrom.innerHTML = options;
  elements.paymentTo.innerHTML = options;
  elements.paymentCurrency.textContent = state.activeHousehold.currency;
  if (settlement) {
    elements.paymentFrom.value = settlement.fromUserId;
    elements.paymentTo.value = settlement.toUserId;
    elements.paymentForm.elements.amount.value = settlement.amount;
  } else if (state.balances?.settlements.length) {
    const first = state.balances.settlements[0];
    elements.paymentFrom.value = first.fromUserId;
    elements.paymentTo.value = first.toUserId;
    elements.paymentForm.elements.amount.value = first.amount;
  } else if (state.activeHousehold.members.length > 1) {
    elements.paymentTo.selectedIndex = 1;
  }
}

async function savePerson() {
  const formData = new FormData(elements.personForm);
  const existingUserId = elements.existingPersonField.classList.contains("is-hidden") ? "new" : formData.get("existingUserId");
  let userId = existingUserId;
  const hadHousehold = Boolean(state.activeHousehold);

  if (hadHousehold && state.session.authenticationRequired) {
    await api(`/households/${encodeURIComponent(state.activeHousehold.id)}/invitations`, {
      method: "POST",
      body: {
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone") || undefined,
        role: formData.get("role") || "member",
      },
    });
    document.querySelector("#person-dialog").close();
    await refreshBaseData(state.activeHousehold.id);
    showToast("Roommate added and invitation email queued.");
    return;
  }

  if (existingUserId === "new") {
    const user = await api("/users", {
      method: "POST",
      body: {
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone") || undefined,
      },
    });
    userId = user.id;
  }

  if (hadHousehold) {
    await api(`/households/${encodeURIComponent(state.activeHousehold.id)}/members`, {
      method: "POST",
      body: { userId, role: formData.get("role") || "member" },
    });
  }

  document.querySelector("#person-dialog").close();
  await refreshBaseData(state.activeHousehold?.id);
  showToast(hadHousehold ? "Roommate added to the household." : "Profile created. Now create your household.");
  if (!hadHousehold) openDialog("household-dialog");
}

async function saveHousehold() {
  const formData = new FormData(elements.householdForm);
  const household = await api("/households", {
    method: "POST",
    body: {
      name: formData.get("name"),
      currency: formData.get("currency"),
      createdByUserId: formData.get("createdByUserId"),
    },
  });
  document.querySelector("#household-dialog").close();
  await refreshBaseData(household.id);
  showToast(`${household.name} is ready.`);
}

async function saveExpense() {
  const formData = new FormData(elements.expenseForm);
  const participantUserIds = formData.getAll("participantUserIds");
  if (!participantUserIds.length) throw new Error("Choose at least one person to split this expense with.");
  const body = {
    description: formData.get("description"),
    amount: formData.get("amount"),
    category: formData.get("category"),
    paymentStatus: "paid",
    paidByUserId: formData.get("paidByUserId"),
    participantUserIds,
  };
  if (!body.paidByUserId) throw new Error("Choose who paid for this expense.");
  if (formData.get("dueDate")) body.dueDate = formData.get("dueDate");
  await api(`/households/${encodeURIComponent(state.activeHousehold.id)}/expenses`, { method: "POST", body });
  document.querySelector("#expense-dialog").close();
  await loadHousehold(state.activeHousehold.id, { quiet: true });
  showToast("Expense added and balances updated.");
}

async function saveCoveredExpense() {
  const expenseId = elements.coverForm.dataset.expenseId;
  const formData = new FormData(elements.coverForm);
  await api(`/households/${encodeURIComponent(state.activeHousehold.id)}/expenses/${encodeURIComponent(expenseId)}/cover`, {
    method: "POST",
    body: { paidByUserId: formData.get("paidByUserId") },
  });
  document.querySelector("#cover-dialog").close();
  await loadHousehold(state.activeHousehold.id, { quiet: true });
  showToast("Bill marked as paid and balances updated.");
}

async function savePayment() {
  const formData = new FormData(elements.paymentForm);
  if (formData.get("fromUserId") === formData.get("toUserId")) {
    throw new Error("Choose two different roommates for this payment.");
  }
  await api(`/households/${encodeURIComponent(state.activeHousehold.id)}/payments`, {
    method: "POST",
    body: {
      fromUserId: formData.get("fromUserId"),
      toUserId: formData.get("toUserId"),
      amount: formData.get("amount"),
      note: formData.get("note") || undefined,
    },
  });
  document.querySelector("#payment-dialog").close();
  await loadHousehold(state.activeHousehold.id, { quiet: true });
  showToast("Payment recorded. Balances are up to date.");
}

async function sendReminderEmails() {
  const originalLabel = elements.sendReminders.textContent;
  elements.sendReminders.disabled = true;
  elements.sendReminders.textContent = "Sending…";
  try {
    const result = await api(`/households/${encodeURIComponent(state.activeHousehold.id)}/reminders/send`, {
      method: "POST",
      body: { asOf: localDateString() },
    });
    const { sent, failed, skipped } = result.delivery;
    showToast(sent ? `${plural(sent, "reminder email")} sent.` : failed ? "Reminder emails could not be delivered." : `${plural(skipped, "reminder")} skipped because email is not configured.`, Boolean(failed));
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.sendReminders.textContent = originalLabel;
    renderDashboard();
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const signingUp = authMode === "sign-up";
  if (signingUp) {
    const currentInput = elements.authSteps[authStep].querySelector("input");
    if (authStep === signUpStepCopy.length - 1) {
      const password = elements.authForm.elements.password;
      currentInput.setCustomValidity(password.value === currentInput.value ? "" : "Passwords do not match.");
    }
    if (!currentInput.reportValidity()) return;
    if (authStep < signUpStepCopy.length - 1) {
      elements.authMessage.textContent = "";
      setAuthStep(authStep + 1);
      return;
    }
  } else if (!elements.authForm.reportValidity()) {
    return;
  }

  const formData = new FormData(elements.authForm);
  const submitButton = elements.authForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = signingUp ? "Creating account…" : "Signing in…";
  elements.authMessage.textContent = "";
  try {
    const body = { email: formData.get("email"), password: formData.get("password") };
    if (signingUp) body.name = formData.get("name");
    await api(signingUp ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email", { method: "POST", body });
    state.session = await api("/session");
    if (!state.session.user) {
      setAuthMode("sign-in");
      elements.authForm.elements.email.value = String(body.email || "");
      elements.authMessage.textContent = "Your account is ready. Sign in to continue.";
      return;
    }
    clearAccountState();
    elements.loadingState.classList.remove("is-hidden");
    await refreshBaseData();
    showApplication();
    elements.loadingState.classList.add("is-hidden");
    setSync("online", "All changes saved securely");
  } catch (error) {
    elements.authMessage.textContent = error.message;
  } finally {
    elements.loadingState.classList.add("is-hidden");
    submitButton.disabled = false;
    submitButton.textContent = authMode === "sign-up"
      ? authStep === signUpStepCopy.length - 1 ? "Create account" : "Continue"
      : "Sign in";
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === "sign-up";
  elements.authForm.reset();
  elements.authForm.elements.confirmPassword.setCustomValidity("");
  elements.authForm.elements.password.autocomplete = signingUp ? "new-password" : "current-password";
  elements.authToggle.innerHTML = signingUp ? 'Already have an account? <strong>Sign in</strong>' : 'New to RentSplit? <strong>Create an account</strong>';
  setAuthStep(0);
}

function setAuthStep(step) {
  const signingUp = authMode === "sign-up";
  authStep = Math.max(0, Math.min(step, signUpStepCopy.length - 1));
  elements.authProgress.classList.toggle("is-hidden", !signingUp);
  elements.authSteps.forEach((field, index) => {
    const visible = signingUp ? index === authStep : index === 1 || index === 2;
    field.classList.toggle("is-hidden", !visible);
    field.querySelector("input").required = visible;
  });
  elements.authBack.classList.toggle("is-hidden", !signingUp || authStep === 0);
  elements.authProgressDots.forEach((dot, index) => dot.classList.toggle("is-active", index <= authStep));

  if (signingUp) {
    elements.authStepLabel.textContent = `Step ${authStep + 1} of ${signUpStepCopy.length}`;
    elements.authTitle.textContent = signUpStepCopy[authStep].title;
    elements.authCopy.textContent = signUpStepCopy[authStep].copy;
  } else {
    elements.authTitle.textContent = "Welcome back";
    elements.authCopy.textContent = "Sign in to see your households, bills, and payment updates.";
  }
  elements.authForm.querySelector('[type="submit"]').textContent = signingUp
    ? authStep === signUpStepCopy.length - 1 ? "Create account" : "Continue"
    : "Sign in";

  const focusTarget = signingUp
    ? elements.authSteps[authStep].querySelector("input")
    : elements.authForm.elements.email;
  if (!elements.authScreen.classList.contains("is-hidden")) setTimeout(() => focusTarget.focus(), 0);
}

async function signOut() {
  elements.signOut.disabled = true;
  try {
    await api("/api/auth/sign-out", { method: "POST", body: {} });
  } catch (error) {
    showToast(error.message, true);
    elements.signOut.disabled = false;
    return;
  }
  state.session.user = null;
  clearAccountState();
  try {
    localStorage.removeItem("rentsplit.householdId");
  } catch {}
  elements.signOut.disabled = false;
  showAuthScreen("You have signed out.");
  renderApp();
}

async function submitForm(event, action) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submitButton = form.querySelector('[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving…";
  try {
    await action();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
}

async function api(path, options = {}) {
  const request = { method: options.method || "GET", headers: {} };
  if (options.body !== undefined) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }
  let response;
  try {
    response = await fetch(path, request);
  } catch {
    setSync("error", "Server connection lost");
    throw new Error("Could not reach RentSplit. Check that the server is running.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.session.authenticationRequired && !path.startsWith("/api/auth/")) {
      state.session.user = null;
      showAuthScreen("Your session expired. Sign in again.");
    }
    const errorMessage = payload.message || payload.error?.message || (typeof payload.error === "string" ? payload.error : null);
    throw new Error(errorMessage || `Request failed with status ${response.status}.`);
  }
  return payload;
}

function setSync(status, message) {
  elements.syncState.classList.toggle("is-online", status === "online");
  elements.syncState.classList.toggle("is-error", status === "error");
  elements.syncState.querySelector("span:last-child").textContent = message;
}

function showStartupError(error) {
  setSync("error", "Server connection failed");
  elements.setupState.classList.remove("is-hidden");
  elements.setupTitle.textContent = "RentSplit could not load";
  elements.setupCopy.textContent = error.message;
  elements.setupActions.innerHTML = '<button class="button button-primary" type="button" data-reload>Try again</button>';
  elements.setupActions.querySelector("[data-reload]").addEventListener("click", () => window.location.reload());
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toastMessage.textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3600);
}

function toggleSidebar() {
  const isOpen = elements.sidebar.classList.toggle("is-open");
  elements.mobileMenu.setAttribute("aria-expanded", String(isOpen));
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  elements.themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  elements.themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  elements.themeToggle.querySelector("use").setAttribute("href", isDark ? "#icon-sun" : "#icon-moon");
  elements.themeColor.content = isDark ? "#161719" : "#ffffff";
}

function readStoredTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "dark" || storedTheme === "light") return storedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function formatMoney(amount, currency) {
  const numericAmount = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${currency} ${numericAmount.toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) return "No due date";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(date);
}

function localDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initials(name) {
  return escapeHtml(String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase());
}

function categoryGlyph(category) {
  return { rent: "⌂", utilities: "↯", groceries: "⌁", internet: "◎", transport: "→", general: "•" }[category] || "•";
}

function safeCategory(category) {
  return ["rent", "utilities", "groceries", "internet", "transport"].includes(category) ? category : "general";
}

function plural(count, singular, customPlural = null) {
  return `${count} ${count === 1 ? singular : customPlural || `${singular}s`}`;
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

function readStoredHouseholdId() {
  try {
    return localStorage.getItem("rentsplit.householdId");
  } catch {
    return null;
  }
}

function storeHouseholdId(householdId) {
  try {
    localStorage.setItem("rentsplit.householdId", householdId);
  } catch {}
}
