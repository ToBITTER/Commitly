# RentSplit API Notes

## Data Model

- User: one roommate account.
- Household: one shared apartment or roommate group.
- Membership: connects a user to a household.
- Expense: a rent, utility, grocery, or shared cost paid by one user.
- ExpenseShare: each participant's portion of an expense.
- Payment: a settlement transfer from one roommate to another.

## Routes

- `GET /users` and `POST /users`
- `GET /households` and `POST /households`
- `GET /households/:id` and `POST /households/:id/members`
- `GET /households/:id/expenses` and `POST /households/:id/expenses`
- `GET /households/:id/payments` and `POST /households/:id/payments`
- `GET /households/:id/balances`
- `GET /households/:id/reminders?asOf=YYYY-MM-DD`

## Balance Formula

For each household member:

```txt
balance = total_paid_for_group - total_share_owed + settlement_payments_sent - settlement_payments_received
```

- Positive balance: this roommate should get money back.
- Negative balance: this roommate owes money.
- Zero balance: this roommate is settled.

## Settlement Algorithm

RentSplit turns balances into the smallest practical set of transfers:

1. Sort debtors by amount owed.
2. Sort creditors by amount they should receive.
3. Match the largest debtor with the largest creditor.
4. Repeat until every balance is settled.

Example:

```txt
Ada: +600000.00
Ben: -300000.00
Chi: -300000.00
```

Settlements:

```txt
Ben pays Ada 300000.00
Chi pays Ada 300000.00
```

## Reminder Digest

`GET /households/:id/reminders?asOf=YYYY-MM-DD` returns reminder messages for current outstanding settlements and includes due expense IDs where the debtor participated.
