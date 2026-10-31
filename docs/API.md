# API reference

REST over HTTPS, JSON. There are no accounts and no sign-in: everything a guest
uses is public, and the one write endpoint, provisioning, is protected by
`CRON_SECRET`.

## Errors

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": { } } }
```

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Input rejected, or no such dish |
| `UNAUTHENTICATED` | 401 | Provisioning without the right `CRON_SECRET` |
| `INTERNAL_ERROR` | 500 | Generic. Never carries a stack trace or SQL |

---

## Table links

### `GET /table/{number}`

The link on a table card. Remembers the table in the `aw_table` cookie (readable
by the page, six hours, never trusted for anything) and redirects to `/menu`. A
value that is not a table number is not remembered; the menu opens anyway.

### `GET /t/{qrToken}`

The link on the first table cards, which carried a random code per table. The
code is looked up in `restaurant_tables`, the table remembered as above, and the
guest sent to `/menu`; an unknown or retired code goes to `/qr-invalid`, which
says nothing about which tables exist.

## Menu

### `GET /api/menu?lang=en|de|vi`

The whole menu in one language: categories with their dishes, prices in Rappen,
allergen codes, photo paths, sold-out marks, and each dish's Vietnamese name.
Dishes served only on certain days are left out on the others.

### `GET /api/menu/items/{id}?lang=` · `GET /api/allergens?lang=`

One dish with its category name; the allergen legend.

### `GET /api/menu/specials/{date}/image`

The photo of that Saturday's special, where one is set.

## Operations

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/setup` | `Authorization: Bearer $CRON_SECRET`. Creates the schema, loads the menu and the tables in the body (`data/<restaurant>-tables.json`), and returns each table's card link. Idempotent |
| `GET` | `/api/health` | Database-backed health check |
