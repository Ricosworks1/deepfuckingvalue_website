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

/* The production raffle. Empty until it is deployed and audited — while it is
   empty this page shows the "not open yet" state and can send nothing at all. */
const RAFFLE = '';

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
  allowance: '0xdd62ed3e',
  approve:   '0x095ea7b3',
  balanceOf: '0x70a08231',
};

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
  const s = whole.toLocaleString('en-US');
  if (places === 0) return (neg ? '-' : '') + s;
  const f = frac.toString().padStart(6, '0').slice(0, places);
  return (neg ? '-' : '') + s + '.' + f;
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
  ]);
  state = {
    sold: decUint(r[0]), total: decUint(r[1]), price: decUint(r[2]),
    remaining: decUint(r[3]), pending: decBool(r[4]), round: decUint(r[5]),
  };
  paint();
  return state;
}

function paint() {
  if (!state) return;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const pct = state.total ? Number(state.sold * 10000n / state.total) / 100 : 0;

  set('r-sold', state.sold.toLocaleString('en-US'));
  set('r-total', state.total.toLocaleString('en-US'));
  set('r-left', state.remaining.toLocaleString('en-US'));
  set('r-price', fmtUSDC(state.price, 2));
  set('r-pot', fmtUSDC(state.sold * state.price, 0));
  set('r-round', state.round.toString());
  set('r-pct', pct.toFixed(1) + '%');
  const bar = $('r-fill'); if (bar) bar.style.width = pct + '%';

  if (state.pending) show($('draw-note')); else hide($('draw-note'));
}

async function loadYou() {
  const r = await Promise.all([
    readRaffle(SEL.mine, encUint(state.round) + encAddress(account)),
    call(USDC, SEL.balanceOf + encAddress(account)),
  ]);
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('you-addr', account.slice(0, 6) + '…' + account.slice(-4));
  set('you-tickets', decUint(r[0]).toLocaleString('en-US'));
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

/* ---------- boot ---------- */

function boot() {
  // Not deployed yet: leave the page in its "not open" state and wire nothing.
  if (!RAFFLE) { show($('not-live')); hide($('live-area')); return; }
  show($('live-area'));
  hide($('not-live'));

  const c = $('connect'); if (c) c.addEventListener('click', connect);
  const b = $('buy');     if (b) b.addEventListener('click', buy);
  const n = $('count');   if (n) n.addEventListener('input', quote);

  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on('accountsChanged', function () { location.reload(); });
    window.ethereum.on('chainChanged', function () { location.reload(); });
  }
  // Read the round without asking for permission first.
  if (window.ethereum) loadRound().catch(function () {});
}

document.addEventListener('DOMContentLoaded', boot);
