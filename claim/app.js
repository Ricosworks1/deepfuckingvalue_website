/* ============================================================================
   DFV — vesting claim interface
   ----------------------------------------------------------------------------
   ZERO DEPENDENCIES. No libraries, no CDN, no bundler, no framework.
   Every contract call is hand-encoded below and can be verified by eye against
   the ABI. All network traffic goes through the user's own wallet provider
   (EIP-1193), so this page never makes an HTTP request of its own — which is
   why its Content-Security-Policy can set connect-src to 'none'.

   Selectors were computed from artifacts/contracts/DFVVesting.sol/DFVVesting.json:
     getClaimableAmount(address)  0xe12f3a61   view
     pools(address,uint256)       0x8f38a555   view
     claim()                      0x4e71d92d   nonpayable, no arguments

   claim() takes no parameters and sends tokens to msg.sender. There is no
   token approval anywhere in this flow, and no way to redirect the recipient.
   ========================================================================== */

'use strict';

const VESTING = '0xdE3Cb3D571F575D3AfAA73b61A6041522eF02D0e';
const TOKEN   = '0x92513406F8AE28D83Dfeb401BCb0c9Df9b690f07';
const CHAIN   = '0x1';            // Ethereum mainnet
const DECIMALS = 18n;

const SEL = {
  claimable: '0xe12f3a61',
  pools:     '0x8f38a555',
  claim:     '0x4e71d92d',
};

/* ---------- tiny DOM helpers ---------- */
const $ = (id) => document.getElementById(id);
const show = (el) => el.hidden = false;
const hide = (el) => el.hidden = true;

let account = null;

/* ---------- encoding / decoding (no library) ---------- */

// Left-pad a 20-byte address into a 32-byte ABI word.
function encAddress(addr) {
  const clean = addr.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(clean)) throw new Error('bad address');
  return clean.padStart(64, '0');
}

function encUint(n) {
  return BigInt(n).toString(16).padStart(64, '0');
}

// Split a returned hex blob into 32-byte words.
function words(hex) {
  const body = hex.replace(/^0x/, '');
  const out = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push(body.slice(i, i + 64));
  return out;
}

const toBig = (word) => BigInt('0x' + word);

/* Format a token amount (18 decimals) for humans.
   Shows full precision for small numbers, thousands separators for whole part. */
function formatAmount(raw) {
  const base = 10n ** DECIMALS;
  const whole = raw / base;
  const frac = raw % base;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (frac === 0n) return wholeStr;
  const fracStr = frac.toString().padStart(Number(DECIMALS), '0').replace(/0+$/, '').slice(0, 4);
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

const shortAddr = (a) => a.slice(0, 6) + '…' + a.slice(-4);

/* ---------- provider access ---------- */

function provider() {
  const p = window.ethereum;
  if (!p) throw new Error('NO_WALLET');
  return p;
}

async function ethCall(to, data) {
  return provider().request({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
}

/* ---------- contract reads ---------- */

async function readClaimable(addr) {
  const res = await ethCall(VESTING, SEL.claimable + encAddress(addr));
  const w = words(res);
  return w.length ? toBig(w[0]) : 0n;
}

/* pools(address,uint256) returns a flat, fully-static tuple:
     0 amount · 1 start · 2 cliffDuration · 3 periodDuration
     4 periodCount · 5 initialUnlockPercent · 6 claimed · 7 isCategory      */
async function readPool(addr) {
  try {
    const res = await ethCall(VESTING, SEL.pools + encAddress(addr) + encUint(0));
    const w = words(res);
    if (w.length < 8) return null;
    const pool = {
      amount:        toBig(w[0]),
      start:         toBig(w[1]),
      cliffDuration: toBig(w[2]),
      periodDuration: toBig(w[3]),
      periodCount:   toBig(w[4]),
      claimed:       toBig(w[6]),
    };
    return pool.amount === 0n ? null : pool;
  } catch {
    return null;   // no pool at index 0 — treated as "not a beneficiary"
  }
}

/* ---------- rendering ---------- */

function setStatus(el, msg, kind) {
  el.textContent = msg;
  el.className = 'msg' + (kind ? ' msg-' + kind : '');
  msg ? show(el) : hide(el);
}

function renderPosition(claimable, pool) {
  const rows = $('rows');
  rows.textContent = '';

  const add = (label, value, note, emphasis) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (emphasis) dd.classList.add('emph');
    if (note) {
      const small = document.createElement('span');
      small.className = 'note';
      small.textContent = note;
      dd.appendChild(small);
    }
    rows.append(dt, dd);
  };

  if (pool) {
    const locked = pool.amount - pool.claimed - claimable;
    add('Total allocation', formatAmount(pool.amount) + ' DFV');
    add('Already claimed', formatAmount(pool.claimed) + ' DFV');
    add('Available now', formatAmount(claimable) + ' DFV', null, true);
    add('Still locked', formatAmount(locked > 0n ? locked : 0n) + ' DFV');

    const cliffEnd = Number(pool.start + pool.cliffDuration) * 1000;
    const now = Date.now();
    if (now < cliffEnd) {
      const days = Math.ceil((cliffEnd - now) / 86400000);
      add('Cliff ends', new Date(cliffEnd).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      }), `${days} day${days === 1 ? '' : 's'} to go — nothing is claimable before this`);
    }
  } else {
    add('Available now', formatAmount(claimable) + ' DFV', null, true);
  }

  show($('position'));
}

function renderNotBeneficiary() {
  hide($('position'));
  show($('not-beneficiary'));
}

/* ---------- flows ---------- */

async function ensureChain() {
  const chainId = await provider().request({ method: 'eth_chainId' });
  if (chainId === CHAIN) return true;

  setStatus($('connect-msg'),
    'Your wallet is on the wrong network. DFV lives on Ethereum mainnet.', 'warn');
  show($('switch'));
  return false;
}

async function switchChain() {
  try {
    await provider().request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN }],
    });
    hide($('switch'));
    setStatus($('connect-msg'), '', null);
    await loadPosition();
  } catch (err) {
    setStatus($('connect-msg'),
      'Could not switch network. Please change to Ethereum mainnet in your wallet.', 'warn');
  }
}

async function connect() {
  try {
    setStatus($('connect-msg'), 'Check your wallet — it should be asking for permission.', null);
    const accounts = await provider().request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts.length) throw new Error('no accounts');
    account = accounts[0];

    $('addr').textContent = shortAddr(account);
    $('addr').title = account;
    show($('connected'));
    hide($('connect'));
    setStatus($('connect-msg'), '', null);

    if (await ensureChain()) await loadPosition();
  } catch (err) {
    if (err && err.message === 'NO_WALLET') {
      setStatus($('connect-msg'),
        'No wallet detected. Install MetaMask, Rabby, or another Ethereum wallet, then reload this page.',
        'warn');
    } else if (err && (err.code === 4001 || /reject|denied/i.test(err.message || ''))) {
      setStatus($('connect-msg'), 'Connection cancelled. Nothing happened.', null);
    } else {
      setStatus($('connect-msg'), 'Could not connect to your wallet. Try reloading the page.', 'warn');
    }
  }
}

async function loadPosition() {
  try {
    setStatus($('position-msg'), 'Reading the contract…', null);
    const [claimable, pool] = await Promise.all([readClaimable(account), readPool(account)]);
    setStatus($('position-msg'), '', null);

    if (!pool && claimable === 0n) { renderNotBeneficiary(); return; }

    hide($('not-beneficiary'));
    renderPosition(claimable, pool);

    const btn = $('claim');
    if (claimable > 0n) {
      btn.disabled = false;
      btn.textContent = `Claim ${formatAmount(claimable)} DFV`;
      setStatus($('claim-msg'), '', null);
    } else {
      btn.disabled = true;
      btn.textContent = 'Nothing available to claim yet';
      setStatus($('claim-msg'),
        'Your allocation is still vesting. Come back any time — there is no deadline and nothing expires.',
        null);
    }
    show($('claim-area'));
  } catch (err) {
    setStatus($('position-msg'),
      'Could not read the contract. Check your connection and reload.', 'warn');
  }
}

async function doClaim() {
  const btn = $('claim');
  try {
    btn.disabled = true;
    setStatus($('claim-msg'), 'Confirm the transaction in your wallet.', null);

    const hash = await provider().request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: VESTING, data: SEL.claim }],
    });

    const link = `https://etherscan.io/tx/${hash}`;
    $('claim-msg').textContent = '';
    const a = document.createElement('a');
    a.href = link; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'View on Etherscan';
    $('claim-msg').append('Transaction sent. ', a);
    $('claim-msg').className = 'msg msg-ok';
    show($('claim-msg'));

    await waitForReceipt(hash);
  } catch (err) {
    if (err && (err.code === 4001 || /reject|denied/i.test(err.message || ''))) {
      setStatus($('claim-msg'), 'Transaction cancelled. Nothing was sent and nothing changed.', null);
    } else {
      setStatus($('claim-msg'),
        'The transaction could not be sent. Nothing was claimed — you can safely try again.', 'warn');
    }
    btn.disabled = false;
  }
}

async function waitForReceipt(hash) {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    let receipt;
    try {
      receipt = await provider().request({
        method: 'eth_getTransactionReceipt', params: [hash],
      });
    } catch { continue; }
    if (!receipt) continue;

    if (receipt.status === '0x1') {
      setStatus($('claim-msg'), 'Claimed. The tokens are in your wallet.', 'ok');
      await loadPosition();
    } else {
      setStatus($('claim-msg'), 'The transaction failed on-chain. No tokens were moved.', 'warn');
      $('claim').disabled = false;
    }
    return;
  }
}

/* ---------- wiring ---------- */

function init() {
  $('vesting-addr').textContent = VESTING;
  $('token-addr').textContent = TOKEN;

  $('connect').addEventListener('click', connect);
  $('switch').addEventListener('click', switchChain);
  $('claim').addEventListener('click', doClaim);

  if (!window.ethereum) {
    setStatus($('connect-msg'),
      'No Ethereum wallet detected in this browser. You can still verify your allocation on Etherscan using the link below — no wallet required.',
      null);
  } else {
    // Re-check everything if the user switches account or network.
    window.ethereum.on?.('accountsChanged', () => window.location.reload());
    window.ethereum.on?.('chainChanged', () => window.location.reload());
  }
}

document.addEventListener('DOMContentLoaded', init);
