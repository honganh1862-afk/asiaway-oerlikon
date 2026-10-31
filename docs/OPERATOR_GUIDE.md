# Floor guide — Asiaway menu

For the people working the floor. The phones show the menu; you take the order.
There is no staff app and nothing to sign in to.

## What the guest does

1. **Scans the card on the table.** It opens the menu with the table number
   already shown at the top.
2. **Chooses how to read the menu:** *Classic*, which turns pages like the
   printed menu, or *Modern*, one long list with photos. Both have the same
   dishes, in English, German or Vietnamese.
3. **Adds dishes to the cart.** The cart says plainly that nothing has been
   ordered yet and that a waiter will come.
4. **Shows you the cart.** Dish numbers are printed large: key those into the
   POS.
5. **Pays at the counter** when finished. Their phone shows the table number to
   give at the counter, and then invites them to review us on Google.

## Taking the order

- The guest's cart is a wish list, not an order. Nothing reaches the kitchen
  until you key it into the POS.
- If a dish is not available today, tell the guest; their phone does not know.
- Special requests are spoken, not typed: ask, and add them in the POS as usual.

## Paying

- **Winterthur:** at the counter in front of the stairs.
- **Oerlikon:** at the counter.

The guest gives their table number; find the bill in the POS by it.

## Table cards

Each table has a fold-over card with its QR code on both sides. Print new ones
with `npm run qr -- winterthur` or `npm run qr -- oerlikon` (see
[Deployment](DEPLOYMENT.md#table-cards)). Older cards with a different-looking
code still work.

## If something goes wrong

- **A card does not scan:** the guest can open the restaurant's address in the
  browser instead; the menu opens without the table number. Replace the card.
- **"This code is not active":** the card is from a table that no longer
  exists. Replace it with a new card.
- **The menu does not load:** check the internet connection on the phone, then
  `/api/health` on the site. Paper menus are the fallback, as the card says.
