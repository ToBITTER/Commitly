# RentSplit

RentSplit is a responsive web app for roommates who share rent, utilities, groceries, and other household expenses.

It tracks who paid, who participated, how much each person owes, and a compact payment plan that settles the household. The browser dashboard and JSON API run together from one lightweight Node server.

## Highlights

- Responsive dashboard for onboarding, expenses, roommates, balances, reminders, and payments
- Multi-household switching with currency-aware formatting
- Settlement logic that calculates who owes whom after expenses and payments
- Friendly validation and durable, concurrency-safe local persistence
- Installable web app shell with no frontend build step

## Tech Stack

- Node.js 22+
- Semantic HTML, modern CSS, and vanilla JavaScript
- Native HTTP server, no framework dependency
- Node test runner
- JSON file storage for local development
- PostgreSQL storage for free cloud deployment

## Quick Start

```sh
npm install
npm start
```

The web app runs on:

```txt
http://localhost:3000
```

Open that address in your browser. The API health check is available at:

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
| `GET` | `/households/:id/payments` | List settlement payments |
| `GET` | `/households/:id/balances` | Calculate who owes who |
| `GET` | `/households/:id/reminders?asOf=YYYY-MM-DD` | Build reminder digest |

## Testing

```sh
npm test
npm run smoke:api
npm run verify
```

## Free Deployment

RentSplit is configured for a free Render web service backed by a free Neon Postgres database. PostgreSQL is used when `DATABASE_URL` is set; local development continues to use the JSON file.

1. Create a free project at [Neon](https://neon.com), select **Connect**, and copy the pooled connection string.
2. In [Render](https://render.com), choose **New → Blueprint** and connect this GitHub repository.
3. Render reads `render.yaml`. Paste the Neon connection string when it asks for `DATABASE_URL`.
4. Create the Blueprint and wait for the health check to pass.
5. Open the generated `https://rentsplit-….onrender.com` address.

Verify the deployed app without changing its data:

```sh
npm run check:deployment -- https://your-rentsplit-url.onrender.com
```

Render's free service sleeps after inactivity, so the first request after a quiet period can take about a minute. Data remains safe in Neon when the service sleeps or redeploys.

## Environment

Copy `.env.example` if you want custom local values:

```txt
PORT=3000
RENTSPLIT_DATA_FILE=./data/rentsplit.json
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

## Potential Next Features

- Authentication
- Scheduled email/WhatsApp reminders
- Recurring rent and utility bills
- CSV/PDF exports
