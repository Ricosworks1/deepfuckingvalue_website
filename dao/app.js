/* ============================================================================
   DFV — DAO page, wallet layer
   ----------------------------------------------------------------------------
   Only two things happen here, and both map directly to functions that exist
   on the deployed contracts:

     read   balanceOf(address)   0x70a08231   your DFV
            getVotes(address)    0x9ab24eb0   your voting power
            delegates(address)   0x587cde1e   who you delegate to
     write  delegate(address)    0x5c19a95c   assign your voting power

   No dependencies. Every call travels through the visitor's own wallet
   provider, so this page never makes a network request of its own.
   ========================================================================== */

'use strict';

const TOKEN = '0x92513406F8AE28D83Dfeb401BCb0c9Df9b690f07';
const CHAIN = '0x1';
const ZERO  = '0x0000000000000000000000000000000000000000';

const SEL = { balanceOf: '0x70a08231', getVotes: '0x9ab24eb0', delegates: '0x587cde1e', delegate: '0x5c19a95c' };

const $ = (id) => document.getElementById(id);
let account = null;

const pad = (a) => {
  const c = a.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(c)) throw new Error('bad address');
  return c.padStart(64, '0');
};
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const fmt = (raw) => (Number(raw) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 2 });

function provider() { if (!window.ethereum) throw new Error('NO_WALLET'); return window.ethereum; }
const ethCall = (data) => provider().request({ method: 'eth_call', params: [{ to: TOKEN, data }, 'latest'] });

function say(el, text, kind) {
  el.textContent = text;
  el.className = 'msg' + (kind ? ' msg-' + kind : '');
  text ? el.removeAttribute('hidden') : el.setAttribute('hidden', '');
}

async function refresh() {
  const [bal, votes, del] = await Promise.all([
    ethCall(SEL.balanceOf + pad(account)),
    ethCall(SEL.getVotes + pad(account)),
    ethCall(SEL.delegates + pad(account)),
  ]);
  const delegate = '0x' + del.slice(-40);

  $('you-addr').textContent = short(account);
  $('you-addr').title = account;
  $('you-bal').textContent = fmt(BigInt(bal)) + ' DFV';
  $('you-votes').textContent = fmt(BigInt(votes)) + ' DFV';

  if (delegate === ZERO) {
    $('you-del').textContent = 'nobody — you cannot vote';
  } else if (delegate.toLowerCase() === account.toLowerCase()) {
    $('you-del').textContent = 'yourself';
  } else {
    $('you-del').textContent = short(delegate);
    $('you-del').title = delegate;
  }

  $('you').removeAttribute('hidden');
  $('delegate-area').removeAttribute('hidden');

  if (BigInt(bal) === 0n) {
    say($('delegate-msg'),
      'This address holds no DFV. Delegating still works, but it assigns zero voting power until you hold some.', null);
  } else if (delegate === ZERO) {
    say($('delegate-msg'),
      'Your DFV is not delegated, so it carries no voting power. Delegate to yourself to activate it.', 'warn');
  } else {
    say($('delegate-msg'), '', null);
  }
}

async function connect() {
  try {
    say($('connect-msg'), 'Check your wallet — it should be asking for permission.', null);
    const accounts = await provider().request({ method: 'eth_requestAccounts' });
    account = accounts[0];

    const chain = await provider().request({ method: 'eth_chainId' });
    if (chain !== CHAIN) {
      say($('connect-msg'), 'Please switch your wallet to Ethereum mainnet.', 'warn');
      return;
    }

    $('connect').setAttribute('hidden', '');
    say($('connect-msg'), '', null);
    await refresh();
  } catch (err) {
    if (err && err.message === 'NO_WALLET') {
      say($('connect-msg'), 'No Ethereum wallet detected. Install MetaMask, Rabby or similar, then reload.', 'warn');
    } else if (err && (err.code === 4001 || /reject|denied/i.test(err.message || ''))) {
      say($('connect-msg'), 'Connection cancelled. Nothing happened.', null);
    } else {
      say($('connect-msg'), 'Could not connect. Try reloading the page.', 'warn');
    }
  }
}

async function doDelegate(to) {
  const msg = $('delegate-msg');
  try {
    say(msg, 'Confirm the transaction in your wallet.', null);
    const hash = await provider().request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: TOKEN, data: SEL.delegate + pad(to) }],
    });

    msg.textContent = 'Delegation sent. ';
    const a = document.createElement('a');
    a.href = 'https://etherscan.io/tx/' + hash;
    a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'View on Etherscan';
    msg.appendChild(a);
    msg.className = 'msg msg-ok';
    msg.removeAttribute('hidden');

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const receipt = await provider().request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (!receipt) continue;
      if (receipt.status === '0x1') { say(msg, 'Done. Your voting power is active.', 'ok'); await refresh(); }
      else say(msg, 'The transaction failed on-chain. Nothing changed.', 'warn');
      return;
    }
  } catch (err) {
    if (err && (err.code === 4001 || /reject|denied/i.test(err.message || ''))) {
      say(msg, 'Cancelled. Nothing was sent.', null);
    } else if (err && err.message === 'bad address') {
      say(msg, 'That does not look like a valid Ethereum address.', 'warn');
    } else {
      say(msg, 'Could not send the transaction. Nothing changed — you can try again.', 'warn');
    }
  }
}

$('connect').addEventListener('click', connect);
$('self').addEventListener('click', () => doDelegate(account));
$('other-toggle').addEventListener('click', () => {
  const el = $('other-area');
  el.hidden ? el.removeAttribute('hidden') : el.setAttribute('hidden', '');
});
$('other-go').addEventListener('click', () => {
  const v = $('other-addr').value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) { say($('delegate-msg'), 'Enter a valid 0x… address.', 'warn'); return; }
  doDelegate(v);
});

if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', () => window.location.reload());
  window.ethereum.on?.('chainChanged', () => window.location.reload());
}
