/* ============================================================================
   DFV — trade data collection
   ----------------------------------------------------------------------------
   Pulls every DFV trade against the Uniswap V4 pool and writes trades.json.

   Method, so anyone can reproduce it:

   1. Ask Alchemy for every ERC-20 transfer of DFV where the Uniswap V4
      PoolManager is either sender or recipient. That is the complete set of
      transactions in which DFV entered or left the pool.
   2. Fetch each transaction receipt and look at the logs emitted by the
      PoolManager itself:
        · a Swap event          -> a real trade
        · a ModifyLiquidity event, and no Swap -> liquidity added or removed
      Only Swaps are counted as trades. This is what stops the initial
      liquidity provision (117.5 billion DFV) from being reported as a sale.
   3. The trader is the receipt's `from` field — the externally owned account
      that signed the transaction — not the router contract that appears as
      the counterparty in the transfer event.
   4. USDC moved in the same transaction gives the trade's value.

   Requires ALCHEMY_RPC_URL in the environment. Free tier is sufficient:
   eth_getLogs is capped at a 10-block range there, which is why this uses
   alchemy_getAssetTransfers instead.
   ========================================================================== */

import { writeFileSync } from 'node:fs';

const RPC = process.env.ALCHEMY_RPC_URL;
if (!RPC) {
  console.error('ALCHEMY_RPC_URL is not set.');
  process.exit(1);
}

const DFV  = '0x92513406F8AE28D83Dfeb401BCb0c9Df9b690f07';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const POOL_MANAGER = '0x000000000004444c5dc75cB358380D2e3dE08A90';

const TOPIC_SWAP = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f';
const TOPIC_MODIFY_LIQUIDITY = '0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec';
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

let rpcCalls = 0;

async function rpc(method, params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
    });
    rpcCalls++;
    const body = await res.json();
    if (body.error) {
      // Free-tier rate limiting — back off and retry rather than losing data.
      if (/rate|limit|429/i.test(JSON.stringify(body.error))) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      throw new Error(`${method}: ${JSON.stringify(body.error).slice(0, 200)}`);
    }
    return body.result;
  }
  throw new Error(`${method}: still rate-limited after 5 attempts`);
}

/* Every page of an asset-transfer query. */
async function allTransfers(extra) {
  const params = {
    fromBlock: '0x0',
    toBlock: 'latest',
    category: ['erc20'],
    withMetadata: true,
    excludeZeroValue: false,
    maxCount: '0x3e8',
    ...extra,
  };
  const out = [];
  for (;;) {
    const page = await rpc('alchemy_getAssetTransfers', [params]);
    out.push(...page.transfers);
    if (!page.pageKey) break;
    params.pageKey = page.pageKey;
  }
  return out;
}

async function main() {
  console.log('Collecting DFV transfers against the Uniswap V4 pool…');

  // Only DFV is queried in bulk. USDC amounts are read out of each transaction
  // receipt further down — querying every USDC transfer touching the V4
  // PoolManager would mean pulling every USDC trade on all of Uniswap V4.
  const [dfvOut, dfvIn] = await Promise.all([
    allTransfers({ fromAddress: POOL_MANAGER, contractAddresses: [DFV] }),
    allTransfers({ toAddress: POOL_MANAGER, contractAddresses: [DFV] }),
  ]);

  console.log(`  DFV out of pool: ${dfvOut.length}`);
  console.log(`  DFV into pool:   ${dfvIn.length}`);

  // One entry per transaction; a single tx can move DFV both ways.
  const txs = new Map();
  const note = (t, dir) => {
    const k = t.hash.toLowerCase();
    const cur = txs.get(k) || {
      hash: t.hash, block: parseInt(t.blockNum, 16),
      timestamp: t.metadata.blockTimestamp, dfvOut: 0, dfvIn: 0,
    };
    cur[dir] += t.value || 0;
    txs.set(k, cur);
  };
  dfvOut.forEach((t) => note(t, 'dfvOut'));
  dfvIn.forEach((t) => note(t, 'dfvIn'));

  console.log(`\nClassifying ${txs.size} transactions by their pool events…`);

  const trades = [];
  const liquidity = [];

  for (const [hash, tx] of txs) {
    const receipt = await rpc('eth_getTransactionReceipt', [tx.hash]);
    if (!receipt) continue;

    const poolLogs = receipt.logs.filter(
      (l) => l.address.toLowerCase() === POOL_MANAGER.toLowerCase()
    );
    const isSwap = poolLogs.some((l) => l.topics[0] === TOPIC_SWAP);
    const isLiquidity = poolLogs.some((l) => l.topics[0] === TOPIC_MODIFY_LIQUIDITY);

    // USDC leg of this same transaction, taken straight from the receipt logs.
    // USDC has 6 decimals.
    const pmTopic = '0x' + POOL_MANAGER.slice(2).toLowerCase().padStart(64, '0');
    const usdcAmount = receipt.logs
      .filter((l) => l.address.toLowerCase() === USDC.toLowerCase()
        && l.topics[0] === TOPIC_TRANSFER
        && (l.topics[1] === pmTopic || l.topics[2] === pmTopic))
      .reduce((max, l) => Math.max(max, Number(BigInt(l.data)) / 1e6), 0);

    const record = {
      hash: tx.hash,
      block: tx.block,
      timestamp: tx.timestamp,
      trader: receipt.from.toLowerCase(),
      // DFV leaving the pool means the trader received it — a buy.
      side: tx.dfvOut > tx.dfvIn ? 'buy' : 'sell',
      dfv: Math.max(tx.dfvOut, tx.dfvIn),
      usdc: usdcAmount,
      gasUsed: parseInt(receipt.gasUsed, 16),
    };

    if (isSwap) trades.push(record);
    else if (isLiquidity) liquidity.push({ ...record, side: tx.dfvIn > tx.dfvOut ? 'add' : 'remove' });
    else liquidity.push({ ...record, side: 'transfer' });

    process.stdout.write(isSwap ? '.' : 'L');
  }

  trades.sort((a, b) => a.block - b.block);
  liquidity.sort((a, b) => a.block - b.block);

  const out = {
    generatedAt: new Date().toISOString(),
    token: DFV,
    pool: POOL_MANAGER,
    quote: 'USDC',
    venue: 'Uniswap V4',
    rpcCalls,
    trades,
    liquidity,
  };

  writeFileSync(new URL('../leaderboard/trades.json', import.meta.url), JSON.stringify(out, null, 2));

  console.log(`\n\nDone.`);
  console.log(`  real trades:          ${trades.length}`);
  console.log(`  liquidity operations: ${liquidity.length}  (excluded from the leaderboard)`);
  console.log(`  distinct traders:     ${new Set(trades.map((t) => t.trader)).size}`);
  console.log(`  RPC calls used:       ${rpcCalls}`);
}

main().catch((err) => { console.error('\n' + err.message); process.exit(1); });
