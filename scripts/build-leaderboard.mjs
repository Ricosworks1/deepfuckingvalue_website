/* ============================================================================
   DFV — trading leaderboard renderer
   ----------------------------------------------------------------------------
   Reads leaderboard/trades.json and writes:

     leaderboard/index.html        the page (static, zero JavaScript)
     leaderboard/trades.csv        every trade, one row each
     leaderboard/leaderboard.csv   all-time totals per trader

   Everything is computed here at build time and baked into the HTML, so the
   published page makes no network requests and needs no client-side code.
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const data = JSON.parse(readFileSync(here('../leaderboard/trades.json'), 'utf8'));
const FONT = readFileSync(here('../assets/architects-daughter.woff2')).toString('base64');

const { trades, liquidity, generatedAt, token, pool, venue, quote } = data;

/* ---------- helpers ---------- */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (n, dp = 0) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

const usd = (n) => '$' + num(n, 2);
const shortAddr = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const monthKey = (ts) => ts.slice(0, 7);
const monthName = (k) => new Date(k + '-01T00:00:00Z')
  .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayOf = (ts) => ts.slice(0, 10);

/* ---------- aggregation ---------- */

function tally(list) {
  const byTrader = new Map();
  for (const t of list) {
    const cur = byTrader.get(t.trader) || {
      trader: t.trader, trades: 0, bought: 0, sold: 0, volumeDfv: 0, volumeUsdc: 0,
      first: t.timestamp, last: t.timestamp,
    };
    cur.trades += 1;
    if (t.side === 'buy') cur.bought += t.dfv; else cur.sold += t.dfv;
    cur.volumeDfv += t.dfv;
    cur.volumeUsdc += t.usdc;
    if (t.timestamp < cur.first) cur.first = t.timestamp;
    if (t.timestamp > cur.last) cur.last = t.timestamp;
    byTrader.set(t.trader, cur);
  }
  return [...byTrader.values()].sort((a, b) => b.volumeUsdc - a.volumeUsdc || b.volumeDfv - a.volumeDfv);
}

const months = [...new Set(trades.map((t) => monthKey(t.timestamp)))].sort().reverse();
const currentMonth = new Date().toISOString().slice(0, 7);
const thisMonthTrades = trades.filter((t) => monthKey(t.timestamp) === currentMonth);

const allTime = tally(trades);
const thisMonth = tally(thisMonthTrades);

const totals = {
  trades: trades.length,
  traders: allTime.length,
  dfv: trades.reduce((s, t) => s + t.dfv, 0),
  usdc: trades.reduce((s, t) => s + t.usdc, 0),
  buys: trades.filter((t) => t.side === 'buy').length,
  sells: trades.filter((t) => t.side === 'sell').length,
};

/* ---------- CSV ---------- */

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

writeFileSync(here('../leaderboard/trades.csv'), csv([
  ['timestamp', 'block', 'trader', 'side', 'dfv_amount', 'usdc_amount', 'tx_hash'],
  ...trades.map((t) => [t.timestamp, t.block, t.trader, t.side, t.dfv, t.usdc, t.hash]),
]));

writeFileSync(here('../leaderboard/leaderboard.csv'), csv([
  ['rank', 'trader', 'trades', 'dfv_bought', 'dfv_sold', 'dfv_volume', 'usdc_volume', 'first_trade', 'last_trade'],
  ...allTime.map((r, i) => [i + 1, r.trader, r.trades, r.bought, r.sold, r.volumeDfv, r.volumeUsdc, r.first, r.last]),
]));

/* ---------- HTML fragments ---------- */

function leaderboardTable(rows, emptyMessage) {
  if (!rows.length) return `<p class="empty">${esc(emptyMessage)}</p>`;
  return `<div class="scroll"><table>
  <thead><tr>
    <th scope="col">#</th><th scope="col">Trader</th><th scope="col" class="r">Trades</th>
    <th scope="col" class="r">DFV bought</th><th scope="col" class="r">DFV sold</th>
    <th scope="col" class="r">Volume (USDC)</th>
  </tr></thead>
  <tbody>
${rows.map((r, i) => `    <tr>
      <td class="rank">${i + 1}</td>
      <td><a href="https://etherscan.io/address/${esc(r.trader)}" rel="noopener" title="${esc(r.trader)}">${esc(shortAddr(r.trader))}</a></td>
      <td class="r">${num(r.trades)}</td>
      <td class="r buy">${r.bought ? num(r.bought) : '—'}</td>
      <td class="r sell">${r.sold ? num(r.sold) : '—'}</td>
      <td class="r strong">${usd(r.volumeUsdc)}</td>
    </tr>`).join('\n')}
  </tbody></table></div>`;
}

function tradesTable(list) {
  if (!list.length) return `<p class="empty">No trades recorded yet.</p>`;
  return `<div class="scroll"><table>
  <thead><tr>
    <th scope="col">Date</th><th scope="col">Trader</th><th scope="col">Side</th>
    <th scope="col" class="r">DFV</th><th scope="col" class="r">USDC</th><th scope="col">Tx</th>
  </tr></thead>
  <tbody>
${list.slice().reverse().map((t) => `    <tr>
      <td>${esc(dayOf(t.timestamp))}</td>
      <td><a href="https://etherscan.io/address/${esc(t.trader)}" rel="noopener" title="${esc(t.trader)}">${esc(shortAddr(t.trader))}</a></td>
      <td><span class="tag tag-${t.side}">${t.side}</span></td>
      <td class="r">${num(t.dfv)}</td>
      <td class="r">${usd(t.usdc)}</td>
      <td><a href="https://etherscan.io/tx/${esc(t.hash)}" rel="noopener">view</a></td>
    </tr>`).join('\n')}
  </tbody></table></div>`;
}

function monthlyHistory() {
  if (!months.length) return '';
  return `<div class="scroll"><table>
  <thead><tr><th scope="col">Month</th><th scope="col" class="r">Trades</th>
  <th scope="col" class="r">Traders</th><th scope="col" class="r">DFV volume</th>
  <th scope="col" class="r">USDC volume</th></tr></thead>
  <tbody>
${months.map((m) => {
    const list = trades.filter((t) => monthKey(t.timestamp) === m);
    return `    <tr>
      <td>${esc(monthName(m))}${m === currentMonth ? ' <span class="tag tag-now">current</span>' : ''}</td>
      <td class="r">${num(list.length)}</td>
      <td class="r">${num(new Set(list.map((t) => t.trader)).size)}</td>
      <td class="r">${num(list.reduce((s, t) => s + t.dfv, 0))}</td>
      <td class="r strong">${usd(list.reduce((s, t) => s + t.usdc, 0))}</td>
    </tr>`;
  }).join('\n')}
  </tbody></table></div>`;
}

/* ---------- page ---------- */

const html = `<title>Trading Leaderboard — DFV</title>
<meta name="description" content="Every DFV trade on Uniswap V4, ranked by volume. Updated daily. Full data downloadable as CSV.">
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
  @font-face {
    font-family: 'Architects Daughter';
    font-style: normal; font-weight: 400; font-display: swap;
    src: url(data:font/woff2;base64,${FONT}) format('woff2');
  }

  :root {
    --paper: #ffffff; --paper-sunk: #f3f4f4;
    --navy: #223f84; --ink: #1b2540; --ink-soft: #515b78; --ink-faint: #8b93a8;
    --red: #e32c4d; --red-sunk: #fdeef1;
    --buy: #1a7f4b; --sell: #c0392b;
    --rule: #dfe4ed; --on-accent: #ffffff;
    --f-hand: 'Architects Daughter', 'Bradley Hand', cursive;
    --f-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --f-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    --gut: clamp(1.1rem, 4vw, 2.25rem);
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #0e1730; --paper-sunk: #121d3a;
      --navy: #9db4ec; --ink: #e7ecf7; --ink-soft: #a9b3cc; --ink-faint: #737d99;
      --red: #ff5573; --red-sunk: #2c1421;
      --buy: #5fd39b; --sell: #ff7a6b;
      --rule: #25314f; --on-accent: #0e1730;
    }
  }

  :root[data-theme="dark"] {
    --paper: #0e1730; --paper-sunk: #121d3a;
    --navy: #9db4ec; --ink: #e7ecf7; --ink-soft: #a9b3cc; --ink-faint: #737d99;
    --red: #ff5573; --red-sunk: #2c1421;
    --buy: #5fd39b; --sell: #ff7a6b;
    --rule: #25314f; --on-accent: #0e1730;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: var(--f-body); line-height: 1.6; -webkit-font-smoothing: antialiased;
  }

  .wrap { max-width: 62rem; margin: 0 auto; padding: clamp(1.5rem, 5vw, 3rem) var(--gut) 4rem; }

  a { color: var(--red); }
  :focus-visible { outline: 3px solid var(--red); outline-offset: 3px; border-radius: 3px; }

  .back { display: inline-block; font-size: 0.875rem; font-weight: 600; color: var(--ink-soft); text-decoration: none; margin-bottom: 1.5rem; }
  .back:hover { color: var(--red); }

  h1 { font-family: var(--f-hand); font-size: clamp(2.25rem, 1.5rem + 3vw, 3.5rem); color: var(--navy); margin: 0; line-height: 1; }
  h2 { font-family: var(--f-hand); font-size: clamp(1.6rem, 1.2rem + 1.5vw, 2.25rem); color: var(--navy); margin: 0 0 0.25rem; line-height: 1.1; }
  .sub { color: var(--ink-soft); margin: 0.75rem 0 0; max-width: 60ch; }

  section { margin-top: clamp(2.5rem, 6vw, 4rem); }
  .lede { color: var(--ink-soft); font-size: 0.9375rem; margin: 0 0 1.25rem; max-width: 62ch; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; margin-top: 2rem; }
  .stat { background: var(--paper); padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .stat dt { font-size: 0.6875rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); font-family: var(--f-mono); }
  .stat dd { margin: 0; font-family: var(--f-mono); font-size: 1.375rem; font-weight: 600; letter-spacing: -0.03em; color: var(--navy); font-variant-numeric: tabular-nums; }

  .scroll { overflow-x: auto; border: 1px solid var(--rule); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-size: 0.6875rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); font-family: var(--f-mono); padding: 0.75rem 0.9rem; border-bottom: 2px solid var(--rule); white-space: nowrap; background: var(--paper-sunk); }
  td { padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--rule); white-space: nowrap; font-family: var(--f-mono); }
  tr:last-child td { border-bottom: 0; }
  .r { text-align: right; }
  .rank { color: var(--ink-faint); font-weight: 600; }
  .strong { font-weight: 600; color: var(--navy); }
  .buy { color: var(--buy); }
  .sell { color: var(--sell); }
  td a { text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--red) 30%, transparent); }

  .tag { display: inline-block; font-size: 0.6875rem; font-family: var(--f-mono); text-transform: uppercase; letter-spacing: 0.08em; padding: 0.15rem 0.45rem; border-radius: 4px; }
  .tag-buy { background: color-mix(in srgb, var(--buy) 15%, transparent); color: var(--buy); }
  .tag-sell { background: color-mix(in srgb, var(--sell) 15%, transparent); color: var(--sell); }
  .tag-now { background: var(--red-sunk); color: var(--red); }

  .empty { padding: 1.5rem; border: 2px dashed var(--rule); border-radius: 12px; color: var(--ink-soft); font-size: 0.9375rem; margin: 0; }

  .downloads { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }
  .dl { display: inline-flex; align-items: center; gap: 0.5ch; font-family: var(--f-mono); font-size: 0.8125rem; font-weight: 600; padding: 0.65rem 1.1rem; border-radius: 999px; border: 2px solid var(--navy); color: var(--navy); text-decoration: none; }
  .dl:hover { background: var(--navy); color: var(--paper); }

  .method { background: var(--paper-sunk); border-left: 4px solid var(--navy); border-radius: 8px; padding: 1.1rem 1.3rem; font-size: 0.9375rem; color: var(--ink-soft); }
  .method p { margin: 0 0 0.6rem; max-width: 64ch; }
  .method p:last-child { margin-bottom: 0; }
  .method code { font-family: var(--f-mono); font-size: 0.875em; }
  .method strong { color: var(--ink); }

  footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 2px solid var(--rule); font-size: 0.8125rem; color: var(--ink-faint); }
  .addr { font-family: var(--f-mono); word-break: break-all; }
</style>

<div class="wrap">

  <a class="back" href="/">← Back to dfv.fun</a>

  <h1>Trading Leaderboard</h1>
  <p class="sub">
    Every DFV trade on ${esc(venue)}, ranked by volume. Rebuilt from the blockchain
    once a day — nothing here is typed in by hand, and the raw data is downloadable
    below.
  </p>

  <dl class="stats">
    <div class="stat"><dt>Trades, all time</dt><dd>${num(totals.trades)}</dd></div>
    <div class="stat"><dt>Traders</dt><dd>${num(totals.traders)}</dd></div>
    <div class="stat"><dt>DFV traded</dt><dd>${num(totals.dfv)}</dd></div>
    <div class="stat"><dt>Volume</dt><dd>${usd(totals.usdc)}</dd></div>
  </dl>

  <section>
    <h2>This month</h2>
    <p class="lede">${esc(monthName(currentMonth))} — resets on the first of each month. Ranked by USDC volume.</p>
    ${leaderboardTable(thisMonth, 'No trades yet this month. The table fills as soon as someone trades.')}
  </section>

  <section>
    <h2>All time</h2>
    <p class="lede">Every trader since the pool opened, ranked by total USDC volume.</p>
    ${leaderboardTable(allTime, 'No trades recorded yet.')}
  </section>

  <section>
    <h2>Month by month</h2>
    <p class="lede">Each month kept, so the history never disappears when the leaderboard resets.</p>
    ${monthlyHistory()}
  </section>

  <section>
    <h2>Every trade</h2>
    <p class="lede">The complete ledger, newest first. Each row links to the transaction on Etherscan so you can verify it yourself.</p>
    ${tradesTable(trades)}
  </section>

  <section>
    <h2>Take the data</h2>
    <p class="lede">Plain CSV, no signup, no API key. Open it in a spreadsheet and check our arithmetic.</p>
    <div class="downloads">
      <a class="dl" href="trades.csv" download>↓ trades.csv — every trade</a>
      <a class="dl" href="leaderboard.csv" download>↓ leaderboard.csv — totals per trader</a>
      <a class="dl" href="trades.json" download>↓ trades.json — raw</a>
    </div>
  </section>

  <section>
    <h2>How this is built</h2>
    <div class="method">
      <p>Every DFV transfer in or out of the Uniswap V4 PoolManager is collected, then
      each transaction is checked against the events the pool itself emitted. Only
      transactions containing a <code>Swap</code> event are counted as trades.</p>
      <p><strong>This is why the numbers are honest.</strong> ${num(liquidity.length)} transaction${liquidity.length === 1 ? '' : 's'}
      moved DFV in or out of the pool as <em>liquidity</em> rather than trading — including the
      initial provision of roughly 117.5 billion DFV. Counting those as "sales" would
      inflate volume by a factor of thousands. They are excluded, and listed separately
      in the raw JSON.</p>
      <p>The trader shown is the account that signed the transaction, not the router
      contract that appears as the counterparty in the transfer — so aggregators and
      routers never appear on the leaderboard in place of real people.</p>
      <p>Token <span class="addr">${esc(token)}</span> · pool <span class="addr">${esc(pool)}</span> · quoted in ${esc(quote)}.</p>
    </div>
  </section>

  <footer>
    Last rebuilt ${esc(new Date(generatedAt).toUTCString())}. Updated daily at midnight
    Central European Time. Data comes from Ethereum mainnet and can be reproduced by
    anyone — the build script is in the repository.
  </footer>

</div>
`;

writeFileSync(here('../leaderboard/index.html'), html);

console.log('Wrote leaderboard/index.html, trades.csv, leaderboard.csv');
console.log(`  trades: ${totals.trades} · traders: ${totals.traders} · volume: ${usd(totals.usdc)}`);
console.log(`  months tracked: ${months.length}${months.length ? ' (' + months.join(', ') + ')' : ''}`);
console.log(`  liquidity ops excluded: ${liquidity.length}`);
