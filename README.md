# RentSplit

RentSplit is a backend API for roommates who share rent, utilities, groceries, and other house expenses.

It tracks who paid, who participated, how much each person owes, and the smallest set of payments needed to settle up.

## What this project proves

- Multi-user data modeling: users, households, memberships, expenses, shares, and payments
- Settlement logic: calculates who owes who from all expenses and payments
- Reminder logic: creates reminder digests for outstanding balances
- API design: clean JSON endpoints with validation and friendly errors
- Local persistence: stores development data in `data/rentsplit.json`

## Tech Stack

- Node.js 22+
- Native HTTP server, no framework dependency
- Node test runner
- JSON file storage for local development

## Quick Start

```sh
npm install
npm start
```

The API runs on:

```txt
http://localhost:3000
```

Health check:

```sh
curl http://localhost:3000/health
```

On PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

## Example Flow

Create roommates:

```sh
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@example.com"}'

curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ben","email":"ben@example.com"}'
```

Create a household:

```sh
curl -X POST http://localhost:3000/households \
  -H "Content-Type: application/json" \
  -d '{"name":"Flat 4B","currency":"NGN","createdByUserId":"usr_1"}'
```

Add a roommate:

```sh
curl -X POST http://localhost:3000/households/home_1/members \
  -H "Content-Type: application/json" \
  -d '{"userId":"usr_2"}'
```

Add rent paid by one roommate:

```sh
curl -X POST http://localhost:3000/households/home_1/expenses \
  -H "Content-Type: application/json" \
  -d '{"description":"August rent","amount":"200000.00","paidByUserId":"usr_1","participantUserIds":["usr_1","usr_2"],"dueDate":"2026-08-05","category":"rent"}'
```

Check settlement:

```sh
curl http://localhost:3000/households/home_1/balances
```

Result: Ben owes Ada `NGN 100000.00`.

## API Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health check |
| `POST` | `/users` | Create a roommate |
| `GET` | `/users` | List roommates |
| `POST` | `/households` | Create a household |
| `GET` | `/households` | List households |
| `GET` | `/households/:id` | Get household members |
| `POST` | `/households/:id/members` | Add roommate to household |
| `POST` | `/households/:id/expenses` | Add shared expense |
| `GET` | `/households/:id/expenses` | List expenses |
| `POST` | `/households/:id/payments` | Record settlement payment |
| `GET` | `/households/:id/balances` | Calculate who owes who |
| `GET` | `/households/:id/reminders?asOf=YYYY-MM-DD` | Build reminder digest |

## Testing

```sh
npm test
npm run smoke:api
npm run verify
```

## Environment

Copy `.env.example` if you want custom local values:

```txt
PORT=3000
RENTSPLIT_DATA_FILE=./data/rentsplit.json
```

## Next Features

- Authentication
- PostgreSQL database adapter
- Scheduled email/WhatsApp reminders
- Recurring rent and utility bills
- Frontend dashboard
