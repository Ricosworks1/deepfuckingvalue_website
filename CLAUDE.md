# dfv.fun — working on this repo

A **static site with almost no JavaScript**, served straight from this repo by
Cloudflare Pages. Any push to `main` is live within a minute. There is no build
step at deploy time: the committed HTML *is* the site.

The previous dfv.fun ran WordPress and was compromised in August 2026. The
static design removes that entire class of attack, and the posture is enforced
in `_headers`. Most of the rules below exist to keep it that way.

## The rules that are easy to break

**`_headers` is generated.** Edit `i18n/headers.py`, never `_headers` itself.

**Cloudflare applies EVERY matching rule.** A path matched by two rules that
both set `Content-Security-Policy` receives two CSP headers, and the browser
enforces the *intersection* — which silently breaks scripts. So `/*` carries
every header except the CSP, and each page family sets its CSP exactly once.
This is why `/raffle/` lists `/raffle/`, `/raffle/index.html` and
`/raffle/app.js` individually rather than using `/raffle/*`: a wildcard would
also match `/raffle/proof/` and hand that page two policies written for
different pages.

**`connect-src` is absent everywhere on purpose.** No page may make an HTTP
request of its own. The wallet pages (`claim`, `dao`, `raffle`) do every read
and write through the injected EIP-1193 provider, so the page never touches the
network itself. Adding `connect-src` to enable `fetch` would undo the strongest
property this site has.

**No dependencies, anywhere.** No CDN, no bundler, no framework. Contract calls
are hand-encoded, with each selector and its signature written in a comment so a
reader can check it by eye. Match the style in `claim/app.js`.

**Never edit a generated page.** `fr/`, `de/`, `es/`, `vi/`, `zh/` are built
from the English source. Edit the English page or a catalogue, then run
`python3 i18n/finalize.py`. CI fails if a rebuild produces a diff — that failure
means someone hand-edited a mirror and the next nightly build would revert it.

## Adding a page

Five places. Missing any one breaks CI:

1. Write `<page>/index.html`. English is both the source and one of the outputs.
2. `i18n/langs.py` — add to `PAGES`.
3. `i18n/build.py` — add to `PAGES`, and to `for js in [...]` if it has a script.
4. `i18n/finalize.py` — add the script to its **own** `for js in [...]` list.
   That list genuinely exists in two files. Forgetting the second leaves every
   language mirror pointing at a missing `app.js`; the audit catches it as
   "every internal link resolves", which is how it was caught last time.
5. `i18n/headers.py` — add a CSP family.

Then:

```
python3 i18n/build.py extract && python3 i18n/finalize.py && python3 i18n/check.py
```

## The audit is the gate

```
python3 i18n/check.py     # 42 checks: structure, navigation, links, CSP
                          # least-privilege, fonts, translation integrity,
                          # cross-language equivalence, build idempotency
bash i18n/selftest.sh     # breaks the site on purpose, once per class of bug we
                          # have actually hit, and asserts check.py notices each.
                          # Needs a clean tree — it runs git checkout.
```

`check.py` enforces **CSP least privilege**: `script-src` must be present
exactly when a page loads a script and absent when it does not. A page that
gains or loses JavaScript needs its family in `headers.py` updated to match.

## The raffle pages

| Page | JS? | What it is |
|---|---|---|
| `/raffle/` | yes | Entry. Reads the round and buys tickets through the wallet. |
| `/raffle/proof/` | **no** | A fixed record of the mainnet rehearsal. Every figure was read off-chain at build time and baked into the HTML, so it needs no script at all. |

`raffle/app.js` can send exactly two transactions: `USDC.approve` for the exact
cost of the tickets being bought — never unlimited — and `enter(count)`.
`enter` credits `msg.sender`, so there is no recipient argument to redirect.

**`const RAFFLE = ''` is deliberate.** The production contract is not deployed
yet. While that constant is empty the page shows its "not open yet" state and
wires up no handlers, so it can send nothing at all. Filling it in is the switch
that opens the raffle: do it only once the contract is deployed and audited.

The contract lives in a separate repo (`dfv-raffle`). The rehearsal the proof
page documents settled on Ethereum mainnet on 4 September 2026 — those figures
are fixed history, not a live view, and should not be "refreshed".

## Contracts

| Contract | Address |
|----------|---------|
| DFVToken | `0x92513406F8AE28D83Dfeb401BCb0c9Df9b690f07` |
| DFVVesting | `0xdE3Cb3D571F575D3AfAA73b61A6041522eF02D0e` |
| DFVDAO | `0xFa85F00e72B4EfD4d02BB252CdAE23EeE8294508` |
| TimeLock | `0x43ACaFdA67E62a6248183830E03e6E4D3F823eDc` |
| Raffle rehearsal | `0x65B0A55B0d303381b4bf0aF95D9c1cb67E257a1D` |
| Raffle keeper | `0xFEA128525A0787FC512Cd815AA0c5Ab34B1c7e1e` |
| Raffle (production) | not deployed |

## Brand

Navy `#223F84`, crimson `#E32C4D`, pale blue `#BAC5D7`, off-white `#F3F4F4`.
Display face is Architects Daughter, embedded as a base64 `data:` URI and
subsetted per page by the build. Vietnamese uses Patrick Hand — Architects
Daughter ships no Vietnamese glyphs — and Chinese falls back to a system CJK
stack, because `font-src` is `data:` only and a CDN font could never load.
