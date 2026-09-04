# What is checked, and why

`python3 i18n/check.py` runs all of it and exits non-zero on any failure. It
runs on every push and pull request, and again before the nightly rebuild is
allowed to publish.

Every check below exists because something broke, or because it would have
broken silently. The site has no build step and is served straight from this
repo, so a bad commit is live within a minute. This is the only gate.

```
pip install -r i18n/requirements-dev.txt     # fontTools, brotli
python3 i18n/check.py
python3 i18n/check.py --list                 # the checklist, without running
```

## 1. Page structure
- Every language has every page — 36 pages.
- Every page opens with `<!doctype html>` **first**, before any comment. A
  comment ahead of the doctype is invalid ordering and puts old browsers into
  quirks mode.
- Every page declares `<html lang>` matching its directory, and `<meta charset>`.
  *The site relied on Cloudflare's response header alone for months; anywhere
  else that would have turned Chinese and Vietnamese into mojibake.*
- A 404 page exists. *Every unknown path used to return the English home page
  with HTTP 200, which search engines read as a soft 404.*

## 2. Language navigation
- Six flags on every page, exactly one marked `aria-current`, and it matches
  the page's own language.
- `hreflang` covers all six languages plus `x-default`.
- The bar links to **the same page** in the other languages, not to their home
  pages.

*The nightly rebuild silently stripped this bar from `/leaderboard/` and
`/dao/` for days, because those two pages are rendered from their own
templates.*

## 3. Links
- Every internal `href` and `src` resolves to a file that exists. *A relative
  `trades.csv` link pointed at a file that does not exist under `/fr/`.*
- No duplicate `id` attributes on a page.

## 4. Content Security Policy
- Every URL is matched by **exactly one** CSP rule. *Cloudflare applies every
  matching rule and browsers enforce the intersection of them, so two rules
  once silently blocked `app.js`.*
- `/*` sets no CSP at all, for the same reason.
- Every policy locks `default-src`, `base-uri` and `frame-ancestors`.
- `script-src` is granted only to pages that actually load a script. *The
  leaderboard has no JavaScript and must not be allowed any.*
- A page that inlines a `data:` font is served by a policy whose `font-src`
  permits `data:`.

*The rules are path-scoped, so `/claim/*` does not match `/fr/claim/*`.
Publishing the mirrors without regenerating `_headers` would have left 30 pages
with no CSP whatsoever.*

## 5. Fonts
- No page loads an external font. The CSP is `font-src data:`, so one could
  never load anyway.
- **Every glyph used in an `h1`, `h2` or `h3` is present in that page's font.**
  *The site shipped for months with Google's `latin-ext` subset inlined — Latin
  Extended-A and no basic ASCII — so the handwriting face never rendered an
  English heading anywhere. Nobody noticed because Bradley Hand is installed on
  macOS and quietly took over.*

## 6. Translation integrity
- Every catalogue key exists in `catalogue.en.lock.json`.
- **Placeholder sets match English exactly.** `<0>…</0>` stands for inline
  markup; dropping or renumbering one corrupts the page.
- Never-translate terms survive: `DFV`, `Deep Fucking Value`, `Uniswap`,
  `Etherscan`, `USDC`, `claim()`, `getClaimableAmount`, and the rest.
- **Large on-chain figures are unaltered.** Only numbers of seven digits or
  more are compared — small ones legitimately change, because `20 Aug 2026`
  becomes `20/08/2026`, `The 10 Commandments` becomes `十诫`, and Spanish
  rescales `138.84 billion` to the equally correct `138 840 millones`.
- **`<option value>` is byte-identical in every language.** *`memes/app.js`
  compares `state.style === 'impact'`. Translating that attribute kills the
  control with no error at all — the dropdown still looks perfectly translated.*

## 7. Content equivalence
- Contract addresses identical across all six languages.
- The same number of embedded assets, so no base64 blob was corrupted.
- The same markup structure, so translation never moved an image or a tag.
- Every image keeps its `alt` text in every language.

## 8. Build
- `i18n/finalize.py` succeeds.
- **Rebuilding changes nothing.** Everything the generator inserts is wrapped
  in markers and stripped before re-inserting, so the English pages can be both
  source and output. Without this, blank lines and language bars accumulate one
  per build.
- CI additionally fails if a rebuild leaves a diff, which means somebody edited
  a generated page by hand instead of the English source or a catalogue — work
  the next nightly run would silently revert.

## Not covered

- The English copy itself. Nothing checks that a sentence is true.
- Whether a translation is *good*. Placeholders, digits and terminology are
  machine-checkable; register and idiom are not.
- Interactive text inside the JavaScript, which is deliberately English.
- Anything about the raffle contracts. Those live in `dfv-raffle` and have
  their own suite.
