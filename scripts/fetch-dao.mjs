/* ============================================================================
   DFV — DAO state collection
   ----------------------------------------------------------------------------
   Reads the live governance configuration and writes dao/state.json, which the
   page renderer bakes into static HTML. Nothing here is typed by hand: every
   number comes from a contract call, so the published page cannot drift from
   what the code actually says.

   Requires ALCHEMY_RPC_URL.
   ========================================================================== */

import { writeFileSync, readFileSync } from 'node:fs';

const RPC = process.env.ALCHEMY_RPC_URL;
if (!RPC) { console.error('ALCHEMY_RPC_URL is not set.'); process.exit(1); }

const A = {
  token:    '0x92513406F8AE28D83Dfeb401BCb0c9Df9b690f07',
  dao:      '0xFa85F00e72B4EfD4d02BB252CdAE23EeE8294508',
  timelock: '0x43ACaFdA67E62a6248183830E03e6E4D3F823eDc',
  vesting:  '0xdE3Cb3D571F575D3AfAA73b61A6041522eF02D0e',
  treasury: '0xaF786e8cDD7E4390BD629bfDec8f090268FE2934',
  pool:     '0x000000000004444c5dc75cB358380D2e3dE08A90',
};

const SEL = {
  votingDelay: '0x3932abb1', votingPeriod: '0x02a251a3',
  proposalThreshold: '0xb58131b0', quorumNumerator: '0xa7713a70',
  quorumDenominator: '0x97c3d334', totalSupply: '0x18160ddd',
  balanceOf: '0x70a08231', delegates: '0x587cde1e', getVotes: '0x9ab24eb0',
  getOwners: '0xa0e67e2b', getThreshold: '0xe75235b8', name: '0x06fdde03',
};

const pad = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');

async function call(to, data) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${to} ${data.slice(0, 10)}: ${JSON.stringify(j.error).slice(0, 120)}`);
  return j.result;
}

const big  = (hex) => BigInt(hex);
const asNum = (hex) => Number(BigInt(hex));
const tokens = (hex) => Number(BigInt(hex)) / 1e18;

async function balance(who) { return tokens(await call(A.token, SEL.balanceOf + pad(who))); }

/* Decode a dynamic address[] return. */
function decodeAddressArray(hex) {
  const b = hex.replace(/^0x/, '');
  const len = parseInt(b.slice(64, 128), 16);
  return Array.from({ length: len }, (_, i) =>
    '0x' + b.slice(128 + i * 64 + 24, 128 + (i + 1) * 64));
}

async function main() {
  console.log('Reading DAO configuration from mainnet…');

  const [
    votingDelay, votingPeriod, proposalThreshold,
    qNum, qDen, totalSupply,
  ] = await Promise.all([
    call(A.dao, SEL.votingDelay), call(A.dao, SEL.votingPeriod),
    call(A.dao, SEL.proposalThreshold), call(A.dao, SEL.quorumNumerator),
    call(A.dao, SEL.quorumDenominator), call(A.token, SEL.totalSupply),
  ]);

  const [poolBal, vestBal, treasBal, daoBal, tlBal] = await Promise.all(
    [A.pool, A.vesting, A.treasury, A.dao, A.timelock].map(balance));

  const [owners, threshold, treasDelegate] = await Promise.all([
    call(A.treasury, SEL.getOwners),
    call(A.treasury, SEL.getThreshold),
    call(A.token, SEL.delegates + pad(A.treasury)),
  ]);

  const supply = tokens(totalSupply);
  const quorumFraction = asNum(qNum) / asNum(qDen);
  const quorumTokens = supply * quorumFraction;

  // Tokens that could ever vote: everything not sitting in the pool or the
  // vesting contract, neither of which delegates.
  const votable = supply - poolBal - vestBal;

  // Recent traded price, reused from the leaderboard data.
  let price = null;
  try {
    const t = JSON.parse(readFileSync(new URL('../leaderboard/trades.json', import.meta.url), 'utf8'));
    const recent = t.trades.filter((x) => x.usdc > 0).slice(-6);
    if (recent.length) {
      price = recent.reduce((s, x) => s + x.usdc, 0) / recent.reduce((s, x) => s + x.dfv, 0);
    }
  } catch { /* price is optional */ }

  const out = {
    generatedAt: new Date().toISOString(),
    addresses: A,
    governance: {
      votingDelaySeconds: asNum(votingDelay),
      votingPeriodSeconds: asNum(votingPeriod),
      proposalThreshold: tokens(proposalThreshold),
      quorumNumerator: asNum(qNum),
      quorumDenominator: asNum(qDen),
      quorumPercent: quorumFraction * 100,
      quorumTokens,
      clockMode: 'timestamp',
    },
    supply: {
      total: supply,
      inPool: poolBal,
      inVesting: vestBal,
      inTreasury: treasBal,
      inDao: daoBal,
      inTimelock: tlBal,
      potentiallyVotable: votable,
    },
    treasury: {
      address: A.treasury,
      balance: treasBal,
      type: 'Gnosis Safe',
      owners: decodeAddressArray(owners),
      threshold: asNum(threshold),
      delegate: '0x' + treasDelegate.slice(-40),
    },
    price,
    proposals: [],   // populated once the first proposal exists
  };

  writeFileSync(new URL('../dao/state.json', import.meta.url), JSON.stringify(out, null, 2));

  console.log(`  voting delay      ${out.governance.votingDelaySeconds / 86400} days`);
  console.log(`  voting period     ${out.governance.votingPeriodSeconds / 86400} days`);
  console.log(`  proposal threshold ${out.governance.proposalThreshold.toLocaleString()} DFV`);
  console.log(`  quorum            ${out.governance.quorumPercent}% = ${quorumTokens.toLocaleString()} DFV`);
  console.log(`  potentially votable ${votable.toLocaleString()} DFV`);
  console.log(`  treasury          ${treasBal.toLocaleString()} DFV, ${out.treasury.threshold}-of-${out.treasury.owners.length} Safe`);
  console.log(`  price             ${price ? '$' + price.toFixed(8) : 'unknown'}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
