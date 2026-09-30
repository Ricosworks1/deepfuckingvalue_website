/* ============================================================================
   DFV — raffle interface
   ----------------------------------------------------------------------------
   ZERO DEPENDENCIES. No libraries, no CDN, no bundler, no framework.
   Every contract call is hand-encoded below and can be verified by eye against
   the ABI. All network traffic goes through the user's own wallet provider
   (EIP-1193), so this page never makes an HTTP request of its own — which is
   why its Content-Security-Policy can set connect-src to 'none'.

   Selectors computed from artifacts/contracts/RolexRaffle.sol/RolexRaffle.json:
     ticketsSold()                  0x8f15024f   view
     ticketsRemaining()             0x3548002a   view
     TICKET_PRICE()                 0x1a95f15f   view
     TICKETS()                      0x18c33e46   view
     roundId()                      0x8cd221c9   view
     drawPending()                  0x6060ffaa   view
     ticketsBought(uint256,address) 0x500f1e4e   view
     enter(uint256)                 0xa59f3e0c   nonpayable
     PRIZE_BPS()                    0x944d1210   view
     WINNERS()                      0xc79078b8   view
     WATCH_FLOOR()                  0xb6f29ee7   view
     WATCH_VALUE()                  0x41b7fac5   view
     MIN_TICKETS()                  0x4d221ef9   view
     REFUND_BPS()                   0x37db35b3   view

   And on USDC:
     allowance(address,address)     0xdd62ed3e   view
     approve(address,uint256)       0x095ea7b3   nonpayable
     balanceOf(address)             0x70a08231   view

   THE ONLY TWO TRANSACTIONS THIS PAGE CAN SEND:
     1. USDC.approve(RAFFLE, exact cost of the tickets being bought)
     2. RAFFLE.enter(count)
   The approval is for the exact amount, never unlimited, and it is granted to
   the raffle address hardcoded below and to nothing else. enter() credits the
   tickets to msg.sender; there is no recipient argument to redirect.
   ========================================================================== */

'use strict';

/* The production raffle, live on Ethereum mainnet since 30 September 2026:
   deployed at block 26,090,539, source verified on Etherscan, and every
   immutable read back off-chain and matched against the contract repo's
   config before this line was filled in.

   While this constant is empty the page shows its "not open yet" state and
   wires up no handlers, so it can send nothing at all. */
const RAFFLE = '0xcF5f2525c4e8B1328223B9AbC967FFFb800bf17C';

const USDC  = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const CHAIN = '0x1';                 // Ethereum mainnet

const SEL = {
  sold:      '0x8f15024f',
  remaining: '0x3548002a',
  price:     '0x1a95f15f',
  total:     '0x18c33e46',
  round:     '0x8cd221c9',
  pending:   '0x6060ffaa',
  mine:      '0x500f1e4e',
  enter:     '0xa59f3e0c',
  prizeBps:  '0x944d1210',
  winners:   '0xc79078b8',
  watchFloor:'0xb6f29ee7',
  watchValue:'0x41b7fac5',
  minTickets:'0x4d221ef9',
  refundBps: '0x37db35b3',
  allowance: '0xdd62ed3e',
  approve:   '0x095ea7b3',
  balanceOf: '0x70a08231',
};

/* ---------- language ---------- */

/* This script is copied unchanged into all six language mirrors, so anything
   it displays has to come from the page rather than from here. Numbers follow
   the page's own language: 1,000.50 in English is 1 000,50 in French. */
const LOCALE = document.documentElement.getAttribute('lang') || 'en-US';
const DECIMAL = (1.1).toLocaleString(LOCALE).replace(/[0-9]/g, '') || '.';

/** A phrase from the markup, where the translation pipeline can reach it.
    `vars` fills {placeholders}; the English text is the fallback. */
function t(el, name, fallback, vars) {
  let out = (el && el.dataset[name]) || fallback;
  if (vars) for (const k in vars) out = out.split('{' + k + '}').join(vars[k]);
  return out;
}

/* ---------- tiny DOM helpers ---------- */
const $ = (id) => document.getElementById(id);
const show = (el) => { if (el) el.hidden = false; };
const hide = (el) => { if (el) el.hidden = true; };

let account = null;
let state = null;

/* ---------- encoding / decoding (no library) ---------- */

function encAddress(addr) {
  const clean = String(addr).toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(clean)) throw new Error('bad address');
  return clean.padStart(64, '0');
}
function encUint(n) {
  const v = BigInt(n);
  if (v < 0n) throw new Error('negative');
  return v.toString(16).padStart(64, '0');
}
const decUint = (hex) => BigInt(hex && hex !== '0x' ? hex : '0x0');
const decBool = (hex) => decUint(hex) !== 0n;

/** USDC has 6 decimals. Formatted without floating point. */
function fmtUSDC(v, places) {
  if (places === undefined) places = 2;
  let neg = v < 0n; if (neg) v = -v;
  const whole = v / 1000000n, frac = v % 1000000n;
  const s = whole.toLocaleString(LOCALE);
  if (places === 0) return (neg ? '-' : '') + s;
  const f = frac.toString().padStart(6, '0').slice(0, places);
  return (neg ? '-' : '') + s + DECIMAL + f;
}

/* ---------- wallet plumbing ---------- */

function provider() {
  const p = window.ethereum;
  if (!p) throw new Error('no-wallet');
  return p;
}

async function call(to, data) {
  return provider().request({ method: 'eth_call', params: [{ to: to, data: data }, 'latest'] });
}
async function readRaffle(sel, args) {
  return call(RAFFLE, sel + (args || ''));
}

async function requireMainnet() {
  const id = await provider().request({ method: 'eth_chainId' });
  if (id === CHAIN) return;
  try {
    await provider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN }] });
  } catch (e) {
    throw new Error('wrong-network');
  }
}

/* ---------- messages ---------- */

function say(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg' + (kind ? ' ' + kind : '');
  show(el);
}

function humanError(e) {
  const m = (e && (e.message || (e.data && e.data.message))) || String(e);
  if (e && (e.code === 4001 || /user rejected|denied/i.test(m))) return 'You cancelled that in your wallet.';
  if (m === 'no-wallet') return 'No Ethereum wallet found. Install MetaMask or Rabby, then reload.';
  if (m === 'wrong-network') return 'Please switch your wallet to Ethereum mainnet.';
  if (/round closed/i.test(m))        return 'This round has closed.';
  if (/exceeds round size/i.test(m))  return 'That is more tickets than are left in the round.';
  if (/draw in progress/i.test(m))    return 'The draw is running. Entries reopen with the next round.';
  if (/transferFrom failed/i.test(m)) return 'The USDC transfer failed — check your balance and approval.';
  if (/insufficient funds/i.test(m))  return 'Not enough ETH to pay for gas.';
  return m.length > 180 ? m.slice(0, 180) + '…' : m;
}

/* ---------- reading the round ---------- */

async function loadRound() {
  const r = await Promise.all([
    readRaffle(SEL.sold), readRaffle(SEL.total), readRaffle(SEL.price),
    readRaffle(SEL.remaining), readRaffle(SEL.pending), readRaffle(SEL.round),
    /* The prize shape. Read from the contract rather than written into this
       page, so what a buyer is shown before paying and what the contract pays
       afterwards can never drift apart. All six are immutable. */
    readRaffle(SEL.prizeBps), readRaffle(SEL.winners), readRaffle(SEL.watchFloor),
    readRaffle(SEL.watchValue), readRaffle(SEL.minTickets), readRaffle(SEL.refundBps),
  ]);
  state = {
    sold: decUint(r[0]), total: decUint(r[1]), price: decUint(r[2]),
    remaining: decUint(r[3]), pending: decBool(r[4]), round: decUint(r[5]),
    prizeBps: decUint(r[6]), winners: decUint(r[7]), watchFloor: decUint(r[8]),
    watchValue: decUint(r[9]), minTickets: decUint(r[10]), refundBps: decUint(r[11]),
  };
  paint();
  return state;
}

/* What this round would pay if it settled now, by exactly the arithmetic in
   RolexRaffle.rawFulfillRandomWords: integer division throughout, the watch
   only above WATCH_FLOOR, and never more winners than tickets sold. */
function project(s) {
  const pot = s.sold * s.price;
  if (s.sold === 0n) return { kind: 'empty' };
  if (s.sold < s.minTickets) {
    return { kind: 'cancelled', refund: (s.price * s.refundBps) / 10000n, pot: pot };
  }
  const winners = s.sold < s.winners ? s.sold : s.winners;
  const watch = pot >= s.watchFloor;
  const cashWinners = watch ? winners - 1n : winners;
  const budget = (pot * s.prizeBps) / 10000n;
  const cashPrize = cashWinners === 0n
    ? 0n
    : (budget - (watch ? s.watchValue : 0n)) / cashWinners;
  return { kind: 'draw', pot: pot, winners: winners, watch: watch, cashPrize: cashPrize };
}

/** "1 in 20", and "1 in 5.4" when the ratio is not a round number. */
function oddsText(el, sold, winners) {
  if (winners === 0n) return '—';
  const tenths = (sold * 10n) / winners;
  const whole = tenths / 10n, rest = tenths % 10n;
  const n = whole.toLocaleString(LOCALE) + (rest === 0n ? '' : DECIMAL + rest);
  return t(el, 'tOdds', '1 in {n}', { n: n });
}

function paint() {
  if (!state) return;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const pct = state.total ? Number(state.sold * 10000n / state.total) / 100 : 0;

  set('r-sold', state.sold.toLocaleString(LOCALE));
  set('r-total', state.total.toLocaleString(LOCALE));
  set('r-left', state.remaining.toLocaleString(LOCALE));
  set('r-price', fmtUSDC(state.price, 2));
  set('r-pot', fmtUSDC(state.sold * state.price, 0));
  set('r-round', state.round.toString());
  set('r-pct', pct.toFixed(1) + '%');
  const bar = $('r-fill'); if (bar) bar.style.width = pct + '%';

  if (state.pending) show($('draw-note')); else hide($('draw-note'));
  renderCalc();                 // now with the config read from the contract

  /* The projection panel. Its markup ships with the full-round figures, so the
     page reads correctly before the raffle opens; from here on it reflects the
     tickets actually sold. */
  const box = $('projection');
  const p = project(state);
  if (p.kind === 'empty') {
    set('pj-winners', '—');
    set('pj-prize', '—');
    set('pj-watch', t(box, 'tEmptyWatch', 'Not yet — nothing has been sold'));
    set('pj-odds', '—');
    set('pj-context', t(box, 'tEmptyContext', 'No tickets have been sold in this round yet.'));
  } else if (p.kind === 'cancelled') {
    set('pj-winners', t(box, 'tCancelledWinners', 'None — the round would be cancelled'));
    set('pj-prize', fmtUSDC(p.refund, 2));
    set('pj-watch', t(box, 'tNo', 'No'));
    set('pj-odds', '—');
    set('pj-context', t(box, 'tCancelledContext', '', {
      min: state.minTickets.toLocaleString(LOCALE),
      refund: fmtUSDC(p.refund, 2),
      price: fmtUSDC(state.price, 2),
      more: (state.minTickets - state.sold).toLocaleString(LOCALE),
    }));
  } else {
    set('pj-winners', p.winners.toLocaleString(LOCALE));
    set('pj-prize', fmtUSDC(p.cashPrize, 2));
    set('pj-watch', p.watch
      ? t(box, 'tAwarded', 'Awarded')
      : t(box, 'tNotAwarded', '', { floor: fmtUSDC(state.watchFloor, 0) }));
    set('pj-odds', oddsText(box, state.sold, p.winners));
    set('pj-context', t(box, p.watch ? 'tContext' : 'tContextNoWatch', '',
      { sold: state.sold.toLocaleString(LOCALE) }));
  }
}

async function loadYou() {
  const r = await Promise.all([
    readRaffle(SEL.mine, encUint(state.round) + encAddress(account)),
    call(USDC, SEL.balanceOf + encAddress(account)),
  ]);
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('you-addr', account.slice(0, 6) + '…' + account.slice(-4));
  set('you-tickets', decUint(r[0]).toLocaleString(LOCALE));
  set('you-usdc', fmtUSDC(decUint(r[1]), 2));
  show($('you'));
}

/* ---------- actions ---------- */

async function connect() {
  const btn = $('connect');
  try {
    btn.disabled = true;
    const accts = await provider().request({ method: 'eth_requestAccounts' });
    await requireMainnet();
    account = accts[0];
    hide($('connect-msg'));
    hide(btn);
    await loadRound();
    await loadYou();
    show($('buy-area'));
  } catch (e) {
    say($('connect-msg'), humanError(e), 'bad');
  } finally {
    btn.disabled = false;
  }
}

function ticketCount() {
  const el = $('count');
  const raw = ((el && el.value) || '').trim();
  if (!/^\d+$/.test(raw)) throw new Error('Enter how many tickets you want, as a whole number.');
  const n = BigInt(raw);
  if (n <= 0n) throw new Error('Enter at least one ticket.');
  if (state && n > state.remaining) throw new Error('Only ' + state.remaining + ' tickets are left in this round.');
  return n;
}

function quote() {
  const msg = $('quote');
  try {
    const n = ticketCount();
    msg.textContent = n + (n === 1n ? ' ticket costs ' : ' tickets cost ')
                    + fmtUSDC(n * state.price, 2) + ' USDC';
    msg.className = 'msg';
    show(msg);
  } catch (e) { hide(msg); }
}

async function buy() {
  const msg = $('buy-msg');
  const btn = $('buy');
  try {
    btn.disabled = true;
    const n = ticketCount();
    const cost = n * state.price;
    await requireMainnet();

    // 1. Approve exactly what these tickets cost — never unlimited.
    const cur = decUint(await call(USDC, SEL.allowance + encAddress(account) + encAddress(RAFFLE)));
    if (cur < cost) {
      say(msg, 'Approve ' + fmtUSDC(cost, 2) + ' USDC in your wallet…', '');
      const tx1 = await provider().request({
        method: 'eth_sendTransaction',
        params: [{ from: account, to: USDC, data: SEL.approve + encAddress(RAFFLE) + encUint(cost) }],
      });
      say(msg, 'Approval sent. Waiting for it to confirm before buying…', '');
      await waitFor(tx1);
    }

    // 2. Buy the tickets.
    say(msg, 'Confirm the purchase in your wallet…', '');
    const tx2 = await provider().request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: RAFFLE, data: SEL.enter + encUint(n) }],
    });
    say(msg, 'Buying… ' + tx2.slice(0, 10) + '…', '');
    await waitFor(tx2);

    say(msg, 'Done. You now hold ' + n + (n === 1n ? ' more ticket' : ' more tickets') + ' in this round.', 'good');
    await loadRound();
    await loadYou();
  } catch (e) {
    say(msg, humanError(e), 'bad');
  } finally {
    btn.disabled = false;
  }
}

/** Poll for a receipt through the wallet. No HTTP request of our own. */
async function waitFor(hash) {
  for (let i = 0; i < 120; i++) {
    const r = await provider().request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (r) {
      if (decUint(r.status) !== 1n) throw new Error('The transaction reverted on-chain.');
      return r;
    }
    await new Promise((done) => setTimeout(done, 3000));
  }
  throw new Error('Still pending after six minutes — check your wallet.');
}

/* ---------- the "try any round size" calculator ----------

   Pure arithmetic, no chain access: it answers "what would a round of N
   tickets pay?", which is a question about the rules rather than about the
   current round. The rules come from the contract when the page has read them,
   and from the panel's data attributes before that — the same immutable values
   either way. It is hidden in the markup and revealed here, so a visitor
   without JavaScript sees the static table instead of dead controls. */

function calcConfig(box) {
  const d = (k) => BigInt(box.getAttribute('data-' + k));
  /* Live values win once the page has read them; both are the same immutable
     constants, but reading beats trusting a copy. */
  if (state && state.winners) return {
    price: state.price, tickets: state.total, winners: state.winners,
    prizeBps: state.prizeBps, watchValue: state.watchValue, watchFloor: state.watchFloor,
    minTickets: state.minTickets, refundBps: state.refundBps,
  };
  return {
    price: d('price'), tickets: d('tickets'), winners: d('winners'),
    prizeBps: d('prize-bps'), watchValue: d('watch-value'), watchFloor: d('watch-floor'),
    minTickets: d('min-tickets'), refundBps: d('refund-bps'),
  };
}

/* The slider is logarithmic. On a linear one, every size a real round might
   plausibly reach — ten tickets, fifty, five hundred — is crushed into the
   first millimetre, and the whole point is to let someone feel the difference
   between a small round and a full one. */
const SLIDER_STEPS = 1000;

/* The exact number of tickets under consideration. It is kept here rather than
   read back off the slider, because a thousand-step log scale cannot land on
   every integer — and the pair that matters most, 499 against 500, are one
   step apart on it. A preset sets this exactly and moves the thumb to the
   nearest position; dragging sets it from the thumb. */
let calcSold = 1000;
const sliderToTickets = (v, max) =>
  Math.min(max, Math.max(1, Math.round(Math.pow(max, v / SLIDER_STEPS))));
const ticketsToSlider = (n, max) =>
  Math.round(Math.log(Math.max(1, n)) / Math.log(max) * SLIDER_STEPS);

/* The chance that `n` tickets include at least one of the `w` winning tickets,
   drawn without replacement from `t`: one minus the chance of missing every
   time, which is the running product (t-w)/(t) · (t-w-1)/(t-1) · … */
function chanceOfAny(n, w, t) {
  if (w >= t) return 1;
  let miss = 1;
  for (let i = 0; i < n; i++) {
    const left = t - w - i;
    if (left <= 0) return 1;
    miss *= left / (t - i);
  }
  return 1 - miss;
}

function pctText(x) {
  const one = x >= 0.1 ? (Math.round(x * 1000) / 10).toFixed(1)
                       : (Math.round(x * 10000) / 100).toFixed(2);
  return one.replace('.', DECIMAL) + '%';
}

/* Write a sentence from the markup into `el`, emphasising each figure as it
   goes in. The emphasis follows the {placeholders}, so the sentences stay
   plain text: markup inside a translatable attribute does not survive the
   build, and a translator should not have to carry tags around anyway. */
function fillMarkup(el, tpl, vars) {
  while (el.firstChild) el.removeChild(el.firstChild);
  const parts = String(tpl).split(/(\{\w+\})/g);
  for (const part of parts) {
    const m = /^\{(\w+)\}$/.exec(part);
    if (m && Object.prototype.hasOwnProperty.call(vars, m[1])) {
      const b = document.createElement('b');
      b.textContent = vars[m[1]];
      el.appendChild(b);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  }
}

/** One hundred dots, with the winning share lit: odds as a picture. */
function paintDots(box, winners, sold) {
  const grid = $('calc-dots');
  if (!grid) return;
  const lit = sold === 0 ? 0 : Math.max(winners > 0 ? 1 : 0, Math.round(winners / sold * 100));
  while (grid.firstChild) grid.removeChild(grid.firstChild);
  for (let i = 0; i < 100; i++) {
    const dot = document.createElement('i');
    if (i < lit) dot.className = 'win';
    grid.appendChild(dot);
  }
  return lit;
}

function renderCalc() {
  const box = $('calc');
  if (!box) return;
  const slider = $('calc-sold'), mineInput = $('calc-mine');
  if (!slider || !mineInput) return;

  const cfg = calcConfig(box);
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const maxTickets = Number(cfg.tickets);

  const soldN = Math.min(maxTickets, Math.max(1, calcSold));
  const sold = BigInt(soldN);

  const raw = (mineInput.value || '').replace(/[^0-9]/g, '');
  let mineN = raw === '' ? 1 : parseInt(raw, 10);
  if (!(mineN >= 1)) mineN = 1;
  if (mineN > soldN) mineN = soldN;          // you cannot hold more than were sold
  const mine = BigInt(mineN);

  const p = project({ sold: sold, price: cfg.price, winners: cfg.winners,
                      prizeBps: cfg.prizeBps, watchFloor: cfg.watchFloor,
                      watchValue: cfg.watchValue, minTickets: cfg.minTickets,
                      refundBps: cfg.refundBps });

  const chips = $('calc-chips');
  if (chips) for (const b of chips.children)
    b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-n')) === soldN));

  set('calc-sold-label', sold.toLocaleString(LOCALE));
  set('calc-pot', fmtUSDC(sold * cfg.price, 0));
  set('calc-spend', fmtUSDC(mine * cfg.price, 2));

  const verdict = $('calc-verdict');

  if (p.kind === 'cancelled') {
    fillMarkup($('calc-headline'), t(box, 'tHeadlineCancel', ''), {
      sold: sold.toLocaleString(LOCALE),
      refund: fmtUSDC(p.refund, 2),
      price: fmtUSDC(cfg.price, 2),
    });
    set('calc-chance', '0%');
    set('calc-prize', fmtUSDC(p.refund, 2));
    set('calc-prize-label', t(box, 'tRefundLabel', 'USDC refunded per ticket'));
    set('calc-winners', t(box, 'tNone', 'Nobody'));
    set('calc-watch', t(box, 'tNo', 'No'));
    set('calc-odds', '—');
    paintDots(box, 0, soldN);
    fillMarkup($('calc-dots-note'), t(box, 'tDotsCancel', ''), {});
    verdict.textContent = t(box, 'tCancelled', '');
    verdict.className = 'verdict verdict-cancel';
    set('calc-note', t(box, 'tCancelNote', '', {
      min: cfg.minTickets.toLocaleString(LOCALE),
      refund: fmtUSDC(p.refund, 2),
      price: fmtUSDC(cfg.price, 2),
      loss: fmtUSDC(cfg.price - p.refund, 2),
    }));
    return;
  }

  const chance = chanceOfAny(mineN, Number(p.winners), soldN);
  const cashWinners = p.watch ? p.winners - 1n : p.winners;

  fillMarkup($('calc-headline'), t(box, 'tHeadline', ''), {
    mine: mine.toLocaleString(LOCALE),
    sold: sold.toLocaleString(LOCALE),
    chance: chance >= 0.9999 ? t(box, 'tCertain', 'Practically certain') : pctText(chance),
    prize: fmtUSDC(p.cashPrize, 2),
  });

  set('calc-chance', chance >= 0.9999 ? '~100%' : pctText(chance));
  set('calc-prize', fmtUSDC(p.cashPrize, 2));
  set('calc-winners', p.winners.toLocaleString(LOCALE));
  set('calc-watch', p.watch
    ? t(box, 'tAwarded', 'Yes, awarded')
    : t(box, 'tNotAwarded', '', { floor: fmtUSDC(cfg.watchFloor, 0) }));
  set('calc-odds', oddsText(box, sold, p.winners));

  const lit = paintDots(box, Number(p.winners), soldN);
  fillMarkup($('calc-dots-note'), t(box, 'tDots', ''), { k: String(lit) });

  verdict.textContent = t(box, 'tDrawn', '');
  verdict.className = 'verdict verdict-draw';

  /* What a ticket returns on average: everything the round pays out, the watch
     included, spread over every ticket. It is PRIZE_BPS of the price at any
     size, which is the point worth making. */
  const paidOut = p.cashPrize * cashWinners + (p.watch ? cfg.watchValue : 0n);
  set('calc-note', t(box, 'tDrawNote', '', {
    ev: fmtUSDC(paidOut / sold, 2),
    price: fmtUSDC(cfg.price, 2),
    pct: pctText(Number(cfg.prizeBps) / 10000),
  }));
}

function wireCalc() {
  const box = $('calc');
  if (!box) return;
  const slider = $('calc-sold'), mine = $('calc-mine'), chips = $('calc-chips');
  if (!slider || !mine || !chips) return;

  box.hidden = false;                       // without JavaScript, no dead controls
  const maxTickets = Number(box.getAttribute('data-tickets'));

  slider.addEventListener('input', function () {
    calcSold = sliderToTickets(Number(slider.value), maxTickets);
    renderCalc();
  });
  mine.addEventListener('input', renderCalc);
  for (const b of chips.children) {
    b.addEventListener('click', function () {
      calcSold = Number(b.getAttribute('data-n'));
      slider.value = String(ticketsToSlider(calcSold, maxTickets));
      renderCalc();
    });
  }

  calcSold = sliderToTickets(Number(slider.value), maxTickets);
  renderCalc();
}

/* ---------- boot ---------- */

function boot() {
  /* The entry panel is always rendered, so the page shows exactly how entering
     will work. What changes is whether it is connected to anything.

     With no contract deployed, the controls stay disabled as they are in the
     markup and NO handlers are attached, so there is no code path from a click
     to a transaction — the buttons are inert twice over, not merely greyed. */
  wireCalc();

  if (!RAFFLE) {
    /* Preview. Show the whole entry flow so the page reads exactly as it will
       once the raffle opens — the wallet panel and the ticket controls, with
       their placeholder values. Nothing is wired up and every control stays
       disabled as the markup left it, so there is no path from a click to a
       transaction. */
    show($('you'));
    show($('buy-area'));
    return;
  }

  hide($('preview-note'));
  const c = $('connect'); if (c) { c.disabled = false; c.addEventListener('click', connect); }
  const b = $('buy');     if (b) { b.disabled = false; b.addEventListener('click', buy); }
  const n = $('count');   if (n) { n.disabled = false; n.addEventListener('input', quote); }

  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on('accountsChanged', function () { location.reload(); });
    window.ethereum.on('chainChanged', function () { location.reload(); });
  }
  // Read the round without asking for permission first.
  if (window.ethereum) loadRound().catch(function () {});
}

document.addEventListener('DOMContentLoaded', boot);
