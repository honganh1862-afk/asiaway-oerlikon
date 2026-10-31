/**
 * Printable table cards.
 *
 *   npm run qr -- winterthur
 *   npm run qr -- oerlikon
 *
 * One fold-over card per table in data/<restaurant>-tables.json, two to an A4
 * page: cut along the dashed lines, fold along the dotted one, and it stands on
 * the table. The front has the table number and the QR code that opens the
 * menu; the back walks the guest through the visit — scan and choose, the
 * waiter takes the order, enjoy, pay — with the code again, so it can be
 * scanned from either side of the table.
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

function sheet(location: RestaurantLocation, cards: Card[], theme: 'dark' | 'light', logo: string): string {
  const place = PLACES[location];
  const guide = steps(location);
  const card = ({ tableNumber, svg }: Card) => {
    const table = escapeHtml(tableNumber);
    return `<div class="card">
      <section class="face back">
        <div>
          <p class="kicker red">So funktioniert's</p>
          <p class="sub">How it works · Cách gọi món</p>
        </div>
        <ol>${guide
          .map(
            ([de, en], i) =>
              `<li><span class="num">${i + 1}</span><span><b>${de}</b><i>${en}</i></span></li>`,
          )
          .join('')}</ol>
        <div class="again">
          <div class="qr small">${svg}</div>
          <p>Tisch ${table}<br><span>Scan · Scannen · Quét mã</span></p>
        </div>
        <div>
          <p class="paper">Lieber eine Speisekarte aus Papier? Fragen Sie einfach unser Personal.</p>
          <p class="kicker red place">${place.name}</p>
        </div>
      </section>
      <div class="fold"></div>
      <section class="face front">
        <div>
          <p class="kicker">Willkommen bei</p>
          <img class="logo" src="${logo}" alt="Asiaway">
          <p class="kicker dim">${place.cuisine}</p>
        </div>
        <div class="qr">${svg}</div>
        <div>
          <p class="table">Tisch ${table}</p>
          <p class="scan">Scannen für die Speisekarte</p>
          <p class="sub">Scan for the menu · Quét mã xem thực đơn</p>
        </div>
      </section>
    </div>`;
  };

  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    pages.push(`<div class="page">${cards.slice(i, i + 2).map(card).join('')}</div>`);
  }

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Asiaway ${place.name} — table cards</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif; background: #fff; }
  .page { width: 210mm; height: 297mm; display: flex; justify-content: center; align-items: center;
          gap: 6mm; page-break-after: always; }
  .card { width: 95mm; height: 270mm; display: flex; flex-direction: column;
          outline: 0.3mm dashed #9a9a9a; outline-offset: 0; }
  .face { height: 135mm; padding: 9mm 8mm; display: flex; flex-direction: column;
          justify-content: space-between; align-items: center; text-align: center;
          background: ${theme === 'dark' ? 'linear-gradient(180deg, #1f2223, #0d0f10)' : '#ffffff'};
          color: ${theme === 'dark' ? '#f2f1ec' : '#09141d'}; }
  .back { transform: rotate(180deg); }
  .fold { height: 0; border-top: 0.3mm dotted #9a9a9a; }
  .kicker { font-size: 2.6mm; letter-spacing: 0.35em; text-transform: uppercase; font-weight: 600; }
  .dim { opacity: 0.7; margin-top: 2.5mm; }
  .red { color: ${theme === 'dark' ? '#ef5a5f' : '#ac2025'}; }
  .sub { font-size: 2.5mm; opacity: 0.7; margin-top: 1mm; }
  .logo { height: 11mm; margin-top: 2.5mm; }
  .qr { background: #fff; padding: 2.5mm; width: 52mm; border-radius: 2mm;
        ${theme === 'light' ? 'border: 0.3mm solid #d6d6d6;' : ''} }
  .qr svg { display: block; width: 100%; height: auto; }
  .table { font-size: 7mm; letter-spacing: 0.3em; font-weight: 600; text-transform: uppercase; }
  .scan { font-size: 3.6mm; font-weight: 600; margin-top: 2mm; }
  ol { list-style: none; width: 100%; text-align: left; }
  li { display: flex; gap: 3mm; align-items: flex-start; margin: 2.6mm 0; }
  .num { flex: none; width: 6mm; height: 6mm; display: flex; align-items: center; justify-content: center;
         background: #ac2025; color: #fff; font-weight: 700; font-size: 3.2mm; }
  li b { display: block; font-size: 3.3mm; line-height: 1.25; font-weight: 600; }
  li i { display: block; font-size: 2.6mm; font-style: normal; opacity: 0.7; margin-top: 0.4mm; }
  .again { display: flex; align-items: center; gap: 4mm; }
  .qr.small { width: 26mm; padding: 1.5mm; border-radius: 1.5mm; }
  .again p { text-align: left; font-size: 3.6mm; font-weight: 600; letter-spacing: 0.1em; }
  .again span { font-size: 2.5mm; font-weight: 400; letter-spacing: 0; opacity: 0.7; }
  .paper { font-size: 2.6mm; opacity: 0.75; max-width: 70mm; }
  .place { margin-top: 3mm; }
</style>
</head>
<body>
${pages.join('\n')}
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
