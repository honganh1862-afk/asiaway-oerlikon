/**
 * Printable table cards.
 *
 *   npm run qr -- winterthur
 *   npm run qr -- oerlikon
 *
 * One standing tent card per table in data/<restaurant>-tables.json, two to an
 * A4 page (the layout is described at COLUMN below). One face has the table
 * number and the QR code that opens the menu; the other walks the guest through
 * the visit — scan and choose, the waiter takes the order, enjoy, pay — with the
 * code again, so it can be scanned from either side of the table.
 *
 * Writes into ./qr-codes/<restaurant>: the cards as HTML, dark and light, as
 * PDFs too when Google Chrome is installed to print them, and each table's
 * code on its own as SVG and PNG.
 *
 * The codes carry the restaurant's public address (APP_BASE_URL overrides it)
 * and the table number, nothing secret, so they need no database and keep
 * working however often the site is redeployed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import {
  RESTAURANT_PROFILES,
  resolveLocation,
  type RestaurantLocation,
} from '../src/config/restaurant';
import { isTableNumber, tableUrl } from '../src/domain/table';

/** Each restaurant's public address, as Vercel serves it. */
const SITES: Record<RestaurantLocation, string> = {
  oerlikon: 'https://asiaway-oerlikon.vercel.app',
  winterthur: 'https://asiaway-winterthur.vercel.app',
};

const PLACES: Record<RestaurantLocation, { name: string; cuisine: string }> = {
  oerlikon: { name: 'Oerlikon', cuisine: 'Modern Vietnamese Cuisine' },
  winterthur: { name: 'Winterthur', cuisine: 'Vietnamese & Thai Cuisine' },
};

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter((p): p is string => Boolean(p));

interface Card {
  readonly tableNumber: string;
  readonly svg: string;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** The four steps on the back, in German first, as the room reads it. */
function steps(location: RestaurantLocation): [string, string][] {
  const profile = RESTAURANT_PROFILES[location];
  const pay: [string, string] =
    profile.payment === 'table'
      ? ['Rechnung bei der Bedienung verlangen', 'Ask your waiter for the bill']
      : profile.counterPlace === 'stairs'
        ? ['An der Kasse vor der Treppe bezahlen', 'Pay at the counter in front of the stairs']
        : ['An der Kasse bezahlen', 'Pay at the counter'];
  return [
    ['Code scannen & Gerichte wählen', 'Scan the code & choose your dishes'],
    ['Die Bedienung nimmt Ihre Bestellung am Tisch auf', 'Your waiter takes your order at the table'],
    ['Essen geniessen', 'Enjoy your meal'],
    pay,
  ];
}

/**
 * The sheet, in millimetres. Each A4 column is one standing tent card:
 *
 *    0 –  31   end flap, with a slit in from the edge
 *   31 – 148.5 the QR face, printed upside down so it stands the right way up
 *  148.5       the peak
 *  148.5 – 266 the guide face
 *  266 – 297   end flap, with a slit
 *
 * Vertical lines are cuts: the centre line between the two cards and the four
 * slits. The two end flaps fold under at 31 and 266 and lock through each
 * other's slit to make the base. Nothing is drawn across a face, so no line
 * shows once it stands: the base folds are marked only by short ticks on the
 * flaps just outside the crease, which end up under the base, and the peak
 * needs no mark.
 */
const COLUMN = 105;
const FLAP = 31;
const PEAK = 148.5;
const BASE = 266;
const SLIT = 11.5;
const TICK = 10;

function sheet(location: RestaurantLocation, cards: Card[], theme: 'dark' | 'light', logo: string): string {
  const place = PLACES[location];
  const guide = steps(location);
  const dark = theme === 'dark';

  const column = ({ tableNumber, svg }: Card, index: number) => {
    const left = index * COLUMN;
    const table = escapeHtml(tableNumber);
    return `
    <section class="face top" style="left:${left}mm; top:${FLAP}mm">
      <p class="caps welcome">Willkommen bei</p>
      <img class="logo" src="${logo}" alt="Asiaway">
      <p class="caps tagline">${place.cuisine}</p>
      <div class="tile">${svg}</div>
      <p class="caps table">Tisch ${table}</p>
      <p class="scan">Scannen für die Speisekarte</p>
      <p class="hint">Scan for the menu · Quét mã xem thực đơn</p>
    </section>
    <section class="face bottom" style="left:${left}mm; top:${PEAK}mm">
      <div>
        <p class="caps red">So funktioniert's</p>
        <p class="hint">How it works · Cách gọi món</p>
      </div>
      <ol>${guide
        .map(([de, en], i) => `<li><span class="num">${i + 1}</span><span><b>${de}</b><i>${en}</i></span></li>`)
        .join('')}</ol>
      <div class="again">
        <div class="tile small">${svg}</div>
        <p><span class="caps">Tisch ${table}</span><br><span class="hint">Scan · Scannen · Quét mã</span></p>
      </div>
      <div>
        <p class="hint">Lieber eine Speisekarte aus Papier? Fragen Sie einfach unser Personal.</p>
        <p class="caps red place">${place.name}</p>
      </div>
    </section>`;
  };

  // Cuts and fold ticks for one sheet. The ticks sit 8 mm in from each side of
  // a column, on the flap side of each base fold.
  const marks = [
    `<i class="cut" style="left:${COLUMN}mm; top:0; height:297mm"></i>`,
    ...[0, 1].flatMap((c) => {
      const middle = c * COLUMN + COLUMN / 2;
      return [
        `<i class="cut" style="left:${middle}mm; top:0; height:${SLIT}mm"></i>`,
        `<i class="cut" style="left:${middle}mm; top:${297 - SLIT}mm; height:${SLIT}mm"></i>`,
        ...[c * COLUMN + 8, c * COLUMN + COLUMN - 8 - TICK].flatMap((x) => [
          `<i class="tick" style="left:${x}mm; top:${FLAP - 0.8}mm"></i>`,
          `<i class="tick" style="left:${x}mm; top:${BASE + 0.55}mm"></i>`,
        ]),
      ];
    }),
  ].join('\n    ');

  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    const pair = cards.slice(i, i + 2);
    // Dark cards are dark a little way onto the flaps too, so a fold that
    // lands a hair off the crease shows no white edge at the base.
    const boards = dark
      ? pair
          .map((_, c) => `<div class="board" style="left:${c * COLUMN}mm; top:${FLAP - 3}mm; height:${BASE - FLAP + 6}mm"></div>`)
          .join('')
      : '';
    pages.push(`<div class="page">
    ${boards}
    ${pair.map(column).join('')}
    ${marks}
  </div>`);
  }

  const ink = dark ? '#f2f1ec' : '#09141d';
  const muted = dark ? 'rgba(242,241,236,0.7)' : '#6b6b6b';
  const red = dark ? '#ef5a5f' : '#ac2025';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Asiaway ${place.name} — table cards</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: ${ink}; }
  .page { position: relative; width: 210mm; height: 297mm; overflow: hidden;
          break-after: page; page-break-after: always; }
  .page:last-child { break-after: auto; page-break-after: auto; }

  i.cut { position: absolute; display: block; width: 0.25mm; margin-left: -0.125mm; background: #8a8a8a; }
  i.tick { position: absolute; display: block; width: ${TICK}mm; height: 0.25mm; background: #8a8a8a; }
  .board { position: absolute; width: ${COLUMN}mm; background: linear-gradient(180deg, #1f2223, #0d0f10); }

  .face { position: absolute; width: ${COLUMN}mm; height: ${PEAK - FLAP}mm; padding: 6mm 8mm;
          display: flex; flex-direction: column; align-items: center; text-align: center; }
  .top { transform: rotate(180deg); justify-content: center; }
  .bottom { justify-content: space-between; }

  /* Georgia capitals, widely spaced, as on the menu's cover. */
  .caps { font-family: Georgia, "Times New Roman", serif; text-transform: uppercase; letter-spacing: 0.3em; font-size: 7pt; }
  .red { color: ${red}; }
  .welcome { color: ${muted}; }
  .logo { width: 40mm; margin-top: 2.5mm; }
  .tagline { margin-top: 2.5mm; font-size: 6.5pt; letter-spacing: 0.22em; color: ${muted}; }
  .tile { margin-top: 4mm; width: 46mm; padding: 1.8mm; background: #fff; border-radius: 1.5mm;
          ${dark ? '' : 'border: 0.25mm solid #d6d6d6;'} }
  .tile svg { display: block; width: 100%; height: auto; }
  .table { margin-top: 3.5mm; font-size: 12pt; letter-spacing: 0.18em; }
  .scan { margin-top: 2mm; font-size: 9pt; font-weight: 600; }
  .hint { margin-top: 1mm; font-size: 6.5pt; color: ${muted}; line-height: 1.35; }

  ol { list-style: none; width: 100%; text-align: left; }
  li { display: flex; gap: 2.5mm; align-items: flex-start; margin: 2mm 0; }
  .num { flex: none; width: 5mm; height: 5mm; display: flex; align-items: center; justify-content: center;
         background: #ac2025; color: #fff; font-weight: 700; font-size: 8pt; }
  li b { display: block; font-size: 8.5pt; line-height: 1.25; font-weight: 600; }
  li i { display: block; font-size: 6.5pt; font-style: normal; color: ${muted}; margin-top: 0.3mm; }
  .again { display: flex; align-items: center; gap: 4mm; }
  .tile.small { margin-top: 0; width: 22mm; padding: 1.2mm; }
  .again p { text-align: left; }
  .again .caps { font-size: 9pt; letter-spacing: 0.15em; }
  .place { margin-top: 2.5mm; font-size: 8pt; letter-spacing: 0.35em; }

  @media screen {
    body { background: #e9e9e9; padding: 10mm 0; }
    .page { margin: 0 auto 10mm; background: #fff; box-shadow: 0 1mm 4mm rgba(0,0,0,.15); }
  }
</style>
</head>
<body>
  ${pages.join('\n  ')}
</body>
</html>`;
}

async function main(): Promise<void> {
  const location = resolveLocation(process.argv[2] ?? process.env.NEXT_PUBLIC_RESTAURANT_LOCATION);
  const baseUrl = process.env.APP_BASE_URL ?? SITES[location];
  const outDir = resolve(process.cwd(), 'qr-codes', location);

  const { tables } = JSON.parse(
    readFileSync(resolve(process.cwd(), 'data', `${location}-tables.json`), 'utf8'),
  ) as { tables: { tableNumber: string }[] };

  const bad = tables.filter((t) => !isTableNumber(t.tableNumber));
  if (bad.length > 0) throw new Error(`Not a table number: ${bad.map((t) => t.tableNumber).join(', ')}`);

  mkdirSync(outDir, { recursive: true });
  const cards: Card[] = [];
  for (const { tableNumber } of tables) {
    const url = tableUrl(baseUrl, tableNumber);
    const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    const png = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', width: 1200, margin: 2 });
    writeFileSync(resolve(outDir, `table-${tableNumber}.svg`), svg);
    writeFileSync(resolve(outDir, `table-${tableNumber}.png`), png);
    cards.push({ tableNumber, svg });
  }

  const logo = `data:image/png;base64,${readFileSync(
    resolve(process.cwd(), 'public/images/asiaway-logo.png'),
  ).toString('base64')}`;
  const name = `Asiaway-${PLACES[location].name}-table-cards`;
  const chrome = CHROME_PATHS.find((p) => existsSync(p));

  for (const theme of ['dark', 'light'] as const) {
    const html = resolve(outDir, `${name}-${theme}.html`);
    writeFileSync(html, sheet(location, cards, theme, logo));
    if (chrome) {
      execFileSync(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--no-pdf-header-footer',
        `--print-to-pdf=${resolve(outDir, `${name}-${theme}.pdf`)}`,
        pathToFileURL(html).href,
      ], { stdio: 'ignore' });
    }
  }

  console.log(`\n${cards.length} table cards for ${PLACES[location].name}, linking to ${baseUrl}`);
  console.log(`  ${outDir}`);
  console.log(`  ${name}-dark / -light   .html${chrome ? ' and .pdf' : ''} — print on A4, cut, fold`);
  console.log('  table-<n>.svg / .png     — each table’s code on its own');
  if (!chrome) console.log('\nChrome not found: open the .html files in a browser and print them to PDF.');
  console.log('');
}

main().catch((error: unknown) => {
  console.error('\nTable cards FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
