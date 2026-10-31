# Drinks allergen review — NEEDS RESTAURANT SIGN-OFF

The drinks list carries allergen codes **declared from what each drink is**,
at the restaurant's request, not taken from the producers' labels. Every one
needs confirming before guests rely on it.

As on the printed drinks list, a drink shows codes only where they apply: a
drink with a blank cell shows guests **nothing** about allergens (dishes still
say "not declared — please ask"). That makes a missed allergen the dangerous
mistake, so wherever a drink could well carry one, it is declared.

Codes: **A** gluten · **G** milk · **O** sulfites (full legend in the app).

## 1. Declared — please confirm or correct

| ✓ | Drink | Code | Why |
|---|---|---|---|
| ☐ | Aperol Spritz | **O** | Wine-based; sulfites are standard in wine. |
| ☐ | Hugo | **O** | Wine-based. |
| ☐ | Lillet | **O** | Wine-based. |
| ☐ | Gespritzter Weisswein | **O** | Wine. |
| ☐ | Prosecco | **O** | Wine. |
| ☐ | Sake (Japan) | **O** | Rice wine. **Check the bottle**: many sakes have no added sulfites. |
| ☐ | Pflaumenwein (Japan) | **O** | Fruit wine. **Check the bottle.** |
| ☐ | Lycheewine (China) | **O** | Fruit wine. **Check the bottle.** |
| ☐ | Thai Red Milk Tea | **G** | Milk is in the name. |
| ☐ | Saigon, Kirin, Tsingtao, Chang, Singha, Feldschlösschen Alkoholfrei | **A** | Beer is a barley product. |
| ☐ | Café Crème | **G** | Served with cream. **Confirm** — in Switzerland it is often black coffee with cream on the side. |
| ☐ | Cappuccino, Latte Macchiato, Espresso Macchiato, Schale (mit warmer Milch) | **G** | Milk is part of the drink. |
| ☐ | Vietnamesischer Eiskaffee | **G** | Traditionally made with condensed milk. **Confirm the house recipe.** |
| ☐ | Vietnamesischer Heisskaffee (siehe Bild) | **G** | As above. |

## 2. Blank — no allergen expected from the name

These show no allergen information at all. Confirm none of them carries one in
the way the restaurant makes or buys it.

| ✓ | Drink | Worth checking |
|---|---|---|
| ☐ | Vietnamese Iced Tea | **Is it ever served with condensed milk?** If so it needs **G**. |
| ☐ | Mango Caipirinha | The mango product used. |
| ☐ | Pure Coconut Water, Mango Nectar, Lycheesaft, Guavasaft | Packaged juices occasionally list sulfites (O): check the cartons. |
| ☐ | Soju Original, Soju Lychee | Distilled; flavoured soju occasionally lists sulfites. |
| ☐ | Hibiscus, Lemongrass and Lychee Green Iced Tea, Fresh Lime Soda, the three Spritzers | House recipes: anything with milk, nuts or sulfites in the syrups? |
| ☐ | Oishi teas, waters, Coca Cola (Zero), Apfelschorle, Pink Grapefruit Soda, Yuzu Lime Lemonade, Espresso, Espresso Doppio | None expected. |

## How to apply corrections

Edit the `Allergens` column in `data/asiaway_drinks_menu.csv` (space-separated
codes, e.g. `A G`; blank for none), then load it into each restaurant's
database by running its setup again (see [Deployment](DEPLOYMENT.md)). The
setup rejects any code outside the printed legend, and never puts a dish marked
sold out back on sale.
