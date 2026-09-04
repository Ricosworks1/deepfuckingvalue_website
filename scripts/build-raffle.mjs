/* ============================================================================
   DFV — render the raffle participants table
   ----------------------------------------------------------------------------
   Reads raffle/participants.json and rewrites the rows between the markers in
   raffle/index.html. Only the rows are touched; the heading, the column names
   and the surrounding prose are hand-written and translatable, and stay put.

   The generated rows contain nothing but addresses, integers and percentages.
   site_i18n.py already refuses to treat those as translatable strings, so an
   hourly data refresh never adds a single new string to the catalogues.

   Run scripts/fetch-raffle.mjs first, then this, then i18n/finalize.py to push
   the change into the five language mirrors.
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';

const PAGE = 'raffle/index.html';
const START = '<!--participants:start-->';
const END = '<!--participants:end-->';

const data = JSON.parse(readFileSync('raffle/participants.json', 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

let rows = '';
if (data.participants.length) {
  rows = data.participants.map((p) =>
    `        <tr><td><a href="https://etherscan.io/address/${esc(p.address)}" rel="noopener">` +
    `${esc(short(p.address))}</a></td>` +
    `<td>${p.tickets.toLocaleString('en-US')}</td>` +
    `<td>${p.share.toFixed(2)}%</td></tr>`).join('\n');
}

/* The two status rows are permanent in the source; only their `hidden`
   attribute moves. Generating their text would add and remove a translatable
   string on every data change, orphaning it in five catalogues. */
const setHidden = (html, id, hide) => {
  const re = new RegExp(`(<tr id="${id}")( hidden)?(>)`);
  if (!re.test(html)) { console.error(`row #${id} not found`); process.exit(1); }
  return html.replace(re, `$1${hide ? ' hidden' : ''}$3`);
};

const page = readFileSync(PAGE, 'utf8');
const a = page.indexOf(START), b = page.indexOf(END);
if (a === -1 || b === -1) { console.error(`markers not found in ${PAGE}`); process.exit(1); }

let out = page.slice(0, a + START.length) +
          (rows ? '\n' + rows + '\n' : '') + page.slice(b);
out = setHidden(out, 'p-empty',   data.participants.length > 0);
out = setHidden(out, 'p-partial', data.complete !== false);
writeFileSync(PAGE, out);
console.log(`${PAGE}: ${data.participants.length} wallet(s), ` +
            `${data.ticketsSold.toLocaleString('en-US')} tickets, complete=${data.complete}`);
