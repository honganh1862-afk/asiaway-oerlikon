# Asiaway — the menu on the table

Mobile-first menus for Asiaway's two restaurants, Oerlikon and Winterthur. A
guest scans the card on their table and reads the menu on their phone, in
English, German or Vietnamese, without an account, a name or an app. They pick
dishes into a cart and show it to the waiter, who takes the order at the table
and keys it into the POS. They pay at the counter. There is no staff app and no
sign-in.

- [Floor guide](docs/OPERATOR_GUIDE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [API reference](docs/API.md)
- [Original plan and architecture](docs/ASIAWAY_PHASE1_ARCHITECTURE_PLAN.md) (from
  when guests ordered from their phones)

## Quick start

No Docker and no database server needed for development — the dev database is
PGlite, real PostgreSQL 16 compiled to WebAssembly, running in-process.

```bash
npm install && npm run seed && npm run dev
```

The seed prints three demo table links. Open one on a phone, or in a browser.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Unit and integration tests, integration against real PostgreSQL |
| `npm run typecheck` | TypeScript, strict |
| `npm run build` / `npm start` | Production build and standalone server |
| `npm run seed` | Demo tables and the real menu |
| `npm run menu:preview` / `menu:import` | Validate / import the menu CSV |
| `npm run qr -- winterthur` / `oerlikon` | Printable table cards and each table's QR code |
| `npm run db:migrate` | Apply SQL migrations to `DATABASE_URL` |

## What the guest sees

Scans the card on their table, which opens the menu with their table number ·
picks English, German or Vietnamese · chooses how to read the menu: **Classic**,
a book that turns page by page like the printed menu (chalkboard pages, a photo
opening each section), or **Modern**, the scrolling list with photos and
categories · switches between the Vietnamese, Thai (Winterthur only) and drinks
menus in either · adds dishes to a cart that survives a reload · shows the cart
to the waiter, who takes the order (the phone sends no order) · when finished,
is shown where to pay, with the table number to give at the counter, and invited
to review the restaurant on Google. A four-step guide (choose · waiter takes the
order · enjoy · pay) on the start screen, the cart and the paying page shows
where they are.

What differs between the restaurants is in `src/config/restaurant.ts` (Thai
menu, Saturday menu, where the counter is, the review link) and their table
lists in `data/`.

## Menu data

`data/menu_trilingual_EN_DE_VI.csv` holds 50 source rows that expand to **56
orderable items** across five food categories: dishes printed as one line
covering several proteins are split into one item each, sub-numbered `90.1`,
`90.2`, `90.3`, `90.4`, each with its own price and its own allergen set.

**There are no drinks.** The drinks menu has not been supplied and none have been
invented; the food/drink split is already in the data model, so they import later
through the same path. No dish has a photo yet — an item without one renders no
image element rather than a placeholder.

Re-importing is safe: items match on a stable key, so an import updates in place,
an item missing from a later CSV is deactivated rather than deleted, and an
import never puts a dish marked sold out back on sale.

## Layout

```
src/app/         Next.js routes: /menu (classic, modern), /cart, /pay, the
                 table links /table/<n> and /t/<code>, and /api
src/components/  the guest screens' parts: the book, the guide, the shell
src/config/      what differs between the two restaurants
src/domain/      framework-free rules: menus, allergens, table links
src/server/      db, menu import, menu services
src/i18n/        UI strings in messages/{en,de,vi}.json — never inline
data/            menus, photos, each restaurant's tables
migrations/      SQL schema
tests/           unit, and integration on real PostgreSQL
scripts/         seed, menu import, table cards
```

The database still holds the tables from when guests ordered on their phones
(orders, sessions, staff accounts). Nothing reads or writes them any more; they
are kept rather than dropped, along with their history.
