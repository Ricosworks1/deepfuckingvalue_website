/* ============================================================================
   DFV — DAO page renderer
   Reads dao/state.json and writes dao/index.html.
   Global figures are baked in at build time; personal figures (your balance,
   your voting power, your delegate) are read live by dao/app.js through the
   visitor's own wallet.
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const s = JSON.parse(readFileSync(here('../dao/state.json'), 'utf8'));
const FONT = readFileSync(here('../assets/architects-daughter.woff2')).toString('base64');

const { governance: g, supply, treasury, addresses: A, price } = s;

const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n0 = (x) => Number(x).toLocaleString('en-US', { maximumFractionDigits: 0 });
const n2 = (x) => Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const days = (sec) => sec / 86400;
const usd = (dfv) => price ? '$' + Number(dfv * price).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const pct = (part, whole) => (part / whole * 100);

const quorumProgress = Math.min(100, pct(supply.potentiallyVotable, g.quorumTokens));

const html = `<title>The DAO — DFV</title>
<meta name="description" content="How DFV governance works: delegate your vote, propose, and decide. Deliberately slow, deliberately expensive.">
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
  @font-face { font-family:'Architects Daughter'; font-style:normal; font-weight:400; font-display:swap;
    src:url(data:font/woff2;base64,${FONT}) format('woff2'); }

  :root {
    --paper:#ffffff; --paper-sunk:#f3f4f4;
    --navy:#223f84; --ink:#1b2540; --ink-soft:#515b78; --ink-faint:#8b93a8;
    --red:#e32c4d; --red-sunk:#fdeef1;
    --ok:#1a7f4b; --ok-sunk:#e8f5ee; --warn:#8a6100; --warn-sunk:#fdf3dd;
    --rule:#dfe4ed; --on-accent:#ffffff;
    --f-hand:'Architects Daughter','Bradley Hand',cursive;
    --f-body:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --f-mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
    --gut:clamp(1.1rem,4vw,2rem);
  }
  @media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){
    --paper:#0e1730; --paper-sunk:#121d3a; --navy:#9db4ec; --ink:#e7ecf7;
    --ink-soft:#a9b3cc; --ink-faint:#737d99; --red:#ff5573; --red-sunk:#2c1421;
    --ok:#5fd39b; --ok-sunk:#0f2a1f; --warn:#e0b451; --warn-sunk:#2a2211;
    --rule:#25314f; --on-accent:#0e1730; } }
  :root[data-theme="dark"]{
    --paper:#0e1730; --paper-sunk:#121d3a; --navy:#9db4ec; --ink:#e7ecf7;
    --ink-soft:#a9b3cc; --ink-faint:#737d99; --red:#ff5573; --red-sunk:#2c1421;
    --ok:#5fd39b; --ok-sunk:#0f2a1f; --warn:#e0b451; --warn-sunk:#2a2211;
    --rule:#25314f; --on-accent:#0e1730; }

  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--f-body);line-height:1.65;-webkit-font-smoothing:antialiased}
  .wrap{max-width:52rem;margin:0 auto;padding:clamp(1.5rem,5vw,3rem) var(--gut) 4rem}
  a{color:var(--red)}
  :focus-visible{outline:3px solid var(--red);outline-offset:3px;border-radius:4px}
  .back{display:inline-block;font-size:.875rem;font-weight:600;color:var(--ink-soft);text-decoration:none;margin-bottom:1.5rem}
  .back:hover{color:var(--red)}
  h1{font-family:var(--f-hand);font-size:clamp(2.25rem,1.5rem + 3vw,3.5rem);color:var(--navy);margin:0;line-height:1}
  h2{font-family:var(--f-hand);font-size:clamp(1.6rem,1.2rem + 1.5vw,2.25rem);color:var(--navy);margin:0 0 .5rem;line-height:1.1}
  h3{font-size:1rem;color:var(--navy);margin:0 0 .3rem}
  .sub{color:var(--ink-soft);margin:.9rem 0 0;max-width:58ch}
  section{margin-top:clamp(2.5rem,6vw,3.75rem)}
  p{margin:0 0 .85rem;max-width:64ch}
  p:last-child{margin-bottom:0}

  .panel{border:2px solid var(--rule);border-radius:14px;padding:clamp(1.1rem,3vw,1.6rem);background:var(--paper)}
  .panel + .panel{margin-top:1rem}

  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(11rem, 100%), 1fr));gap:1px;background:var(--rule);border:1px solid var(--rule);border-radius:12px;overflow:hidden;margin-top:1.25rem}
  .cell{background:var(--paper);padding:.95rem 1.05rem;display:flex;flex-direction:column;gap:.2rem}
  .cell dt{font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);font-family:var(--f-mono)}
  .cell dd{margin:0;font-family:var(--f-mono);font-size:1.25rem;font-weight:600;letter-spacing:-.03em;color:var(--navy);font-variant-numeric:tabular-nums}
  .cell .sub2{font-size:.6875rem;color:var(--ink-faint);font-family:var(--f-body);letter-spacing:0}

  .why{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(15rem, 100%), 1fr));gap:1.5rem;margin-top:1.5rem}
  .why div{border-top:3px solid var(--navy);padding-top:.9rem}
  .why p{font-size:.9375rem;color:var(--ink-soft)}

  .status{border-left:4px solid var(--warn);background:var(--warn-sunk);border-radius:8px;padding:1rem 1.2rem;margin-top:1.25rem;font-size:.9375rem}
  .status strong{color:var(--warn)}

  .track{height:.75rem;background:var(--paper-sunk);border:2px solid var(--rule);border-radius:999px;overflow:hidden;margin:.75rem 0 .5rem}
  .fill{height:100%;background:var(--navy);min-width:2px}

  .btn{font-family:inherit;font-size:.9375rem;font-weight:700;padding:.8rem 1.4rem;border-radius:999px;cursor:pointer;border:2px solid var(--red);background:var(--red);color:var(--on-accent)}
  .btn:hover:not(:disabled){opacity:.9}
  .btn:disabled{opacity:.45;cursor:not-allowed}
  .btn-quiet{background:transparent;color:var(--red)}
  .actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem}
  input[type=text]{width:100%;font-family:var(--f-mono);font-size:.875rem;padding:.65rem .7rem;border:2px solid var(--rule);border-radius:8px;background:var(--paper);color:var(--ink);margin-top:.5rem}
  input[type=text]:focus{border-color:var(--navy)}

  .msg{margin-top:.9rem;font-size:.9375rem;padding:.7rem .9rem;border-radius:8px;background:var(--paper-sunk);color:var(--ink-soft)}
  .msg-warn{background:var(--warn-sunk);color:var(--warn)}
  .msg-ok{background:var(--ok-sunk);color:var(--ok)}

  dl.kv{display:grid;grid-template-columns:1fr auto;gap:.6rem 1.25rem;margin:0;align-items:baseline}
  dl.kv dt{color:var(--ink-soft);font-size:.9375rem}
  dl.kv dd{margin:0;text-align:right;font-family:var(--f-mono);font-size:.9375rem;font-variant-numeric:tabular-nums;color:var(--navy);font-weight:600}

  table{width:100%;border-collapse:collapse;font-family:var(--f-mono);font-size:.8125rem}
  th{text-align:left;font-size:.6875rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);padding:0 1rem .55rem 0;border-bottom:2px solid var(--navy);white-space:nowrap}
  td{padding:.7rem 1rem .7rem 0;border-bottom:1px solid var(--rule);white-space:nowrap}
  .scroll{overflow-x:auto}
  td a{color:var(--red);text-decoration:none}

  .empty{padding:1.5rem;border:2px dashed var(--rule);border-radius:12px;color:var(--ink-soft);font-size:.9375rem;margin-top:1rem}
  footer{margin-top:3rem;padding-top:1.25rem;border-top:2px solid var(--rule);font-size:.8125rem;color:var(--ink-faint)}
  .addr{font-family:var(--f-mono);word-break:break-all}
</style>

<div class="wrap">

  <a class="back" href="/">← Back to dfv.fun</a>

  <h1>The DAO</h1>
  <p class="sub">
    DFV is governed by whoever holds and delegates DFV. Everything on this page is read
    straight from the contracts — the interface can do exactly what the code allows, and
    nothing else.
  </p>

  <!-- ===== step 1: delegate ===== -->
  <section>
    <h2>First: delegate</h2>
    <p>
      Holding DFV gives you <strong>no voting power at all</strong> until you delegate it —
      including to yourself. This catches nearly everyone. One transaction, once, and your
      balance starts counting.
    </p>

    <div class="panel" id="wallet-panel">
      <button class="btn" type="button" id="connect">Connect wallet</button>
      <div class="msg" id="connect-msg" hidden></div>

      <dl class="kv" id="you" hidden>
        <dt>Your address</dt><dd id="you-addr">—</dd>
        <dt>DFV balance</dt><dd id="you-bal">—</dd>
        <dt>Voting power</dt><dd id="you-votes">—</dd>
        <dt>Currently delegated to</dt><dd id="you-del">—</dd>
      </dl>

      <div id="delegate-area" hidden>
        <div class="actions">
          <button class="btn" type="button" id="self">Delegate to myself</button>
          <button class="btn btn-quiet" type="button" id="other-toggle">Delegate to someone else</button>
        </div>
        <div id="other-area" hidden>
          <input type="text" id="other-addr" placeholder="0x… address to delegate to" spellcheck="false">
          <div class="actions">
            <button class="btn" type="button" id="other-go">Delegate to this address</button>
          </div>
        </div>
        <div class="msg" id="delegate-msg" hidden></div>
      </div>
    </div>
  </section>

  <!-- ===== the rules ===== -->
  <section>
    <h2>The rules, as deployed</h2>
    <p>Read live from <span class="addr">${esc(A.dao)}</span>. These are not our description of the rules — they are the rules.</p>

    <dl class="grid">
      <div class="cell"><dt>To propose</dt><dd>${n0(g.proposalThreshold)}</dd><span class="sub2">DFV delegated · ≈ ${usd(g.proposalThreshold)}</span></div>
      <div class="cell"><dt>Quorum</dt><dd>${g.quorumPercent}%</dd><span class="sub2">${n0(g.quorumTokens)} DFV · ≈ ${usd(g.quorumTokens)}</span></div>
      <div class="cell"><dt>Delay before voting</dt><dd>${days(g.votingDelaySeconds)} days</dd><span class="sub2">after a proposal is filed</span></div>
      <div class="cell"><dt>Voting window</dt><dd>${days(g.votingPeriodSeconds)} days</dd><span class="sub2">then a timelock before execution</span></div>
    </dl>

    <div class="why">
      <div>
        <h3>Slow on purpose</h3>
        <p>${days(g.votingDelaySeconds)} days before voting opens, then ${days(g.votingPeriodSeconds)} days to vote —
        ${days(g.votingDelaySeconds) + days(g.votingPeriodSeconds)} days minimum from proposal to decision. Long
        enough that nobody is rushed, and far too long for a borrowed-token governance attack to survive.</p>
      </div>
      <div>
        <h3>Expensive on purpose</h3>
        <p>Filing a proposal needs ${n0(g.proposalThreshold)} DFV delegated — roughly ${usd(g.proposalThreshold)} at
        the current market price. Proposals therefore cost real conviction, and spam is priced out entirely.</p>
      </div>
      <div>
        <h3>Bought, not granted</h3>
        <p>Voting power is not handed out. It is bought on the open market and delegated. Every vote
        represents someone who paid for their say at the same price as everyone else.</p>
      </div>
    </div>
  </section>

  <!-- ===== where things stand ===== -->
  <section>
    <h2>Where things stand</h2>
    <p>
      Most DFV cannot vote. ${n0(supply.inPool)} sits in the Uniswap pool and ${n0(supply.inVesting)} is
      locked in the vesting contract — neither delegates, so neither has a voice. Voting power only
      exists once tokens are held in a wallet <em>and</em> delegated.
    </p>

    <div class="panel">
      <dl class="kv">
        <dt>Total supply</dt><dd>${n0(supply.total)}</dd>
        <dt>In the Uniswap pool — cannot vote</dt><dd>${n0(supply.inPool)}</dd>
        <dt>Locked in vesting — cannot vote</dt><dd>${n0(supply.inVesting)}</dd>
        <dt>Could vote, if delegated</dt><dd>${n0(supply.potentiallyVotable)}</dd>
        <dt>Needed for quorum</dt><dd>${n0(g.quorumTokens)}</dd>
      </dl>
      <div class="track"><div class="fill" style="width:${quorumProgress.toFixed(3)}%"></div></div>
      <p style="font-size:.8125rem;color:var(--ink-faint);margin:0">
        ${quorumProgress.toFixed(2)}% of the tokens needed for quorum currently exist in a form that could vote.
      </p>
    </div>

    <div class="status">
      <p><strong>Governance is not active yet.</strong> Quorum needs ${n0(g.quorumTokens)} DFV of delegated
      votes, and at most ${n0(supply.potentiallyVotable)} could vote today even if every holder delegated.
      That gap closes as DFV is bought out of the pool and as vested tokens are claimed and delegated —
      roughly ${usd(g.quorumTokens)} of tokens must move into voting hands before the DAO can decide anything.
      Until then this page is honest about it rather than pretending otherwise.</p>
    </div>
  </section>

  <!-- ===== proposals ===== -->
  <section>
    <h2>Proposals</h2>
    <div class="empty">
      No proposals have been filed. The first requires ${n0(g.proposalThreshold)} DFV delegated to a single
      address. When one exists it will appear here, with its live state, tallies and every vote reason
      recorded on-chain.
    </div>
  </section>

  <!-- ===== treasury ===== -->
  <section>
    <h2>The treasury</h2>
    <p>
      ${n2(treasury.balance)} DFV is held in a <strong>${treasury.threshold}-of-${treasury.owners.length}
      Gnosis Safe</strong> at <span class="addr">${esc(treasury.address)}</span>.
    </p>
    <p>
      Being explicit, because it matters: the DAO contract cannot move these funds by itself. A vote
      decides, and the Safe signers execute. The multisig exists so the treasury cannot be lost to a
      single mistake or a single key — the trade-off is that spending it takes a human signature as well
      as a vote.
    </p>
    <div class="scroll"><table>
      <thead><tr><th scope="col">Safe owner</th><th scope="col">On Etherscan</th></tr></thead>
      <tbody>
${treasury.owners.map((o) => `        <tr><td>${esc(short(o))}</td><td><a href="https://etherscan.io/address/${esc(o)}" rel="noopener">${esc(o)}</a></td></tr>`).join('\n')}
      </tbody>
    </table></div>
  </section>

  <!-- ===== contracts ===== -->
  <section>
    <h2>Contracts</h2>
    <div class="scroll"><table>
      <thead><tr><th scope="col">What</th><th scope="col">Address</th></tr></thead>
      <tbody>
        <tr><td>DAO (Governor)</td><td><a href="https://etherscan.io/address/${esc(A.dao)}" rel="noopener">${esc(A.dao)}</a></td></tr>
        <tr><td>TimeLock</td><td><a href="https://etherscan.io/address/${esc(A.timelock)}" rel="noopener">${esc(A.timelock)}</a></td></tr>
        <tr><td>DFV token</td><td><a href="https://etherscan.io/address/${esc(A.token)}" rel="noopener">${esc(A.token)}</a></td></tr>
        <tr><td>Treasury Safe</td><td><a href="https://etherscan.io/address/${esc(A.treasury)}" rel="noopener">${esc(A.treasury)}</a></td></tr>
        <tr><td>Vesting</td><td><a href="https://etherscan.io/address/${esc(A.vesting)}" rel="noopener">${esc(A.vesting)}</a></td></tr>
      </tbody>
    </table></div>
    <p style="margin-top:1rem;font-size:.9375rem;color:var(--ink-soft)">
      The token itself is immutable: six functions, no mint, no burn, no pause, no upgrade, no owner.
      The supply that exists is the supply that will always exist. Governance parameters live on the DAO
      contract and can only be changed by a passed proposal.
    </p>
  </section>

  <footer>
    Figures read from Ethereum mainnet ${esc(new Date(s.generatedAt).toUTCString())} and refreshed daily.
    Your balance, voting power and delegate are read live from your own wallet.
  </footer>

</div>

<script src="app.js" defer></script>
`;

writeFileSync(here('../dao/index.html'), html);
console.log('Wrote dao/index.html');
console.log(`  quorum progress: ${quorumProgress.toFixed(2)}%`);
