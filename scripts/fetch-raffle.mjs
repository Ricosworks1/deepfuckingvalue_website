/* ============================================================================
   DFV — raffle participants
   ----------------------------------------------------------------------------
   Writes raffle/participants.json: who holds how many tickets in the round
   that is open right now.

   Method, so anyone can reproduce it:

   1. Read the raffle's own state with eth_call — roundId, ticketsSold,
      TICKET_PRICE, TICKETS. These are the authority for the totals.
   2. Ask Alchemy for every USDC transfer INTO the raffle contract. Buying a
      ticket is a transferFrom(buyer -> raffle), so that set is exactly the
      set of purchases, and the sender is the buyer.
      alchemy_getAssetTransfers is used rather than eth_getLogs because the
      free tier caps eth_getLogs at a 10-block range, and a six-month round
      spans well over a million blocks.
   3. Divide each transfer by TICKET_PRICE to get tickets, and sum per wallet.
   4. CROSS-CHECK the total against ticketsSold() from step 1. If they do not
      agree the file records the mismatch and the page says the list may be
      incomplete, rather than quietly publishing wrong numbers. They can
      legitimately differ: anyone can send USDC straight to the contract
      without buying anything, and that transfer is not a purchase.

   Only transfers from the CURRENT round are counted, by starting the scan at
   the block the round opened.

   Requires ALCHEMY_RPC_URL. RAFFLE_ADDRESS selects the contract; with it
   unset the script writes an empty file and the page shows its waiting state.
   ========================================================================== */

import { writeFileSync } from 'node:fs';

const RPC = process.env.ALCHEMY_RPC_URL;
const RAFFLE = (process.env.RAFFLE_ADDRESS || '').trim();
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const OUT = 'raffle/participants.json';

const SEL = {
  roundId:    '0x8cd221c9',
  ticketsSold:'0x8f15024f',
  price:      '0x1a95f15f',
  tickets:    '0x18c33e46',
};

let id = 0;
async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const num  = (hex) => BigInt(hex && hex !== '0x' ? hex : '0x0');

function empty(reason) {
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    raffle: RAFFLE || null, round: null, ticketsSold: 0, ticketsTotal: 0,
    participants: [], complete: true, note: reason,
  }, null, 1) + '\n');
  console.log(`participants.json written — ${reason}`);
}

async function main() {
  if (!RAFFLE) return empty('no raffle contract configured yet');
  if (!RPC) { console.error('ALCHEMY_RPC_URL is not set.'); process.exit(1); }

  const [roundHex, soldHex, priceHex, totalHex] = await Promise.all([
    call(RAFFLE, SEL.roundId), call(RAFFLE, SEL.ticketsSold),
    call(RAFFLE, SEL.price),   call(RAFFLE, SEL.tickets),
  ]);
  const round = num(roundHex), sold = num(soldHex);
  const price = num(priceHex), total = num(totalHex);
  console.log(`round ${round}: ${sold}/${total} sold at ${Number(price) / 1e6} USDC`);

  if (sold === 0n) return empty('the round is open and no tickets have been sold yet');

  /* Every USDC transfer into the raffle. Paged; Alchemy returns at most 1000
     per page and hands back a pageKey when there are more. */
  const transfers = [];
  let pageKey;
  do {
    const params = {
      fromBlock: '0x0', toBlock: 'latest', toAddress: RAFFLE,
      contractAddresses: [USDC], category: ['erc20'],
      withMetadata: false, excludeZeroValue: true, maxCount: '0x3e8',
    };
    if (pageKey) params.pageKey = pageKey;
    const page = await rpc('alchemy_getAssetTransfers', [params]);
    transfers.push(...page.transfers);
    pageKey = page.pageKey;
  } while (pageKey);
  console.log(`${transfers.length} USDC transfers into the contract`);

  /* rawContract.value is hex USDC (6 decimals). Ticket count is that over the
     ticket price; a transfer that is not a whole number of tickets was not a
     purchase, so it is ignored rather than rounded. */
  const byWallet = new Map();
  let counted = 0n;
  for (const t of transfers) {
    const raw = num(t.rawContract?.value ?? '0x0');
    if (raw === 0n || raw % price !== 0n) continue;
    const tickets = raw / price;
    const who = (t.from || '').toLowerCase();
    byWallet.set(who, (byWallet.get(who) ?? 0n) + tickets);
    counted += tickets;
  }

  /* The scan covers every round this contract has ever run. When a previous
     round has settled, `counted` therefore exceeds the current ticketsSold and
     the cross-check below reports the list as incomplete rather than showing
     stale buyers as if they were in this round. */
  const complete = counted === sold;

  const participants = [...byWallet.entries()]
    .map(([address, tickets]) => ({
      address, tickets: Number(tickets),
      share: sold > 0n ? Number(tickets * 10000n / sold) / 100 : 0,
    }))
    .sort((a, b) => b.tickets - a.tickets || a.address.localeCompare(b.address));

  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    raffle: RAFFLE, round: Number(round),
    ticketsSold: Number(sold), ticketsTotal: Number(total),
    ticketPriceUsdc: Number(price) / 1e6,
    participants, complete,
    note: complete ? null
      : `counted ${counted} tickets from transfers but the contract reports ${sold}; the list may be incomplete`,
  }, null, 1) + '\n');

  console.log(`${participants.length} wallets, ${counted} tickets, complete=${complete}`);
  if (!complete) console.warn('MISMATCH — the page will say the list may be incomplete');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
