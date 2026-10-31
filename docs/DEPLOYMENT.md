# Deployment

## What this needs

- A **long-running Node process** — not a serverless function. Server-Sent
  Events and the notification hub both need a live process.
- **PostgreSQL 16** with automated backups.
- **HTTPS**, always, outside localhost.

The deliverable is a Docker image, so it runs on any host that satisfies those
three. **No hosting provider has been chosen** — that is still an open decision
for the restaurant. Fly.io, Railway, Hetzner with Coolify, or any VPS all work.

## Deploying to Vercel (free tier)

Each restaurant is a Vercel project of its own, built from the same code:
`asiaway-oerlikon.vercel.app` and `asiaway-winterthur.vercel.app`. The site is
a menu with no live parts, which serverless suits.

**Required settings**, beyond the usual variables:

| Variable | Value | Why |
|---|---|---|
| `CRON_SECRET` | `openssl rand -base64 32` | Protects `/api/admin/setup` |
| `DATABASE_URL` | the **pooled** connection string | See below |

`vercel.json` pins the region to `fra1`.

**Pooled connections.** Neon, Supabase and friends put PgBouncer in front of
Postgres in transaction mode, where prepared statements break — usually as a
baffling error once traffic picks up, not immediately. `createPostgresDatabase`
detects a pooled URL and disables prepared statements, and drops to one
connection per instance on serverless. Use the **pooled** string, not the direct
one.

## Environments

| | Database | Data | Purpose |
|---|---|---|---|
| Local | PGlite under `.pglite/`, automatic | Demo seed | Development; no Docker needed |
| Staging / demo | Managed PostgreSQL | Demo seed, clearly labelled | Restaurant testing |
| Production | Managed PostgreSQL, backups on | Real menu, real tables | Only after acceptance |

## Environment variables

Copy `.env.example`. Generate each secret with `openssl rand -base64 48`.

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | production | Without it the app refuses to start in production |
| `CRON_SECRET` | yes | Protects `/api/admin/setup`; without it the endpoint refuses everything |
| `APP_BASE_URL` | no | Public HTTPS address. `npm run qr` defaults to each restaurant's Vercel address |
| `NEXT_PUBLIC_RESTAURANT_LOCATION` | no | `oerlikon` (default) or `winterthur`. Picks the Thai menu, the Saturday menu and how guests pay. Read at **build** time |
| `NEXT_PUBLIC_RESTAURANT_TIMEZONE` | no | Default `Europe/Zurich` (confirm — open question E8) |
| `SEED_ALLOW_PROD` | no | Guard; the demo seed refuses a real database without it |

Secrets come from the host's secret store. Never commit a filled-in `.env`.

## First deployment

```bash
docker compose build
```
```bash
DATABASE_URL=postgres://... npm run db:migrate
```
```bash
DATABASE_URL=postgres://... npm run menu:import
```

There are no staff accounts: guests read the menu, the waiter takes the order
at the table and keys it into the POS, and guests pay at the counter.

### Tighten the database privileges

`migrations/0001_grants.sql` is the second layer that makes history append-only:
the application role gets `INSERT` and `SELECT` on `audit_events` and
`order_revisions` and nothing else. Create the role, then apply it:

```bash
psql "$ADMIN_DATABASE_URL" -c "CREATE ROLE asiaway_app LOGIN PASSWORD 'from-your-secret-store';"
```
```bash
psql "$ADMIN_DATABASE_URL" -f migrations/0001_grants.sql
```

Point `DATABASE_URL` at `asiaway_app`, and keep the owner role for migrations
only. **This layer cannot be verified locally** (the local PGlite database runs
single-user) — verify it on staging by confirming that an `UPDATE` on
`audit_events` as `asiaway_app` is refused.

## Table cards

Each table gets a fold-over card whose QR code opens the menu and tells it the
table number (`https://<address>/table/<number>`). The tables come from
`data/oerlikon-tables.json` and `data/winterthur-tables.json`; no database is
needed.

```bash
npm run qr -- winterthur
```
```bash
npm run qr -- oerlikon
```

Each writes `qr-codes/<restaurant>/`: the cards on A4, two per page, as HTML and
(when Google Chrome is installed) PDF, dark and light; and each table's code on
its own as SVG and PNG. **The address is printed into every code**, so check it
in the output before printing: reprinting means revisiting every table.

Cards printed before October 2026 carry a random code per table (`/t/<code>`)
instead of the number. They keep working: the code is looked up in
`restaurant_tables`, which is why provisioning never changes a table's code.

## A second restaurant: Winterthur

Winterthur runs the same code as Oerlikon as a deployment of its own: its own
database, its own address and its own table cards. Nothing is shared while it
runs. A push to `main` redeploys both.

What differs is kept in two files: `src/config/restaurant.ts` (Winterthur has
no Saturday menu) and `src/config/floor-plan.ts` (its room, and which tables
can be pushed together). The food menu, drinks and photos come from the same
files in `data/` as Oerlikon's.

1. **A new database.** Create a second Neon (or other managed PostgreSQL)
   database. Never point Winterthur at Oerlikon's.
2. **A new Vercel project** from the same GitHub repository and branch.
3. **Its own variables**, set before the first build:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_RESTAURANT_LOCATION` | `winterthur` |
   | `DATABASE_URL` | Winterthur's **pooled** connection string |
   | `CRON_SECRET` | Newly generated. Never reuse Oerlikon's |

4. **Provision it** — schema, menu and Winterthur's 45 tables in one call:

   ```bash
   curl -X POST "https://WINTERTHUR-ADDRESS/api/admin/setup" -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" --data @data/winterthur-tables.json
   ```

   The response lists each table with its card link. It reports
   `"saturdayItems": 0`, which is correct for Winterthur.
5. **Table cards**, as in [Table cards](#table-cards).

Changing `NEXT_PUBLIC_RESTAURANT_LOCATION` later needs a redeploy, not just a
restart: it is built into the pages.

## Routine deployment

1. Build the image.
2. `npm run db:migrate` (forward-only; never edit an applied migration).
3. Start the new container.
4. Check `/api/health` — it returns 503 if the database is unreachable, so a
   broken instance is never given traffic.

## Backups

Daily `pg_dump` plus point-in-time recovery, retained at least 30 days.

**Rehearse a restore before go-live.** An untested backup is not a backup.
