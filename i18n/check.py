#!/usr/bin/env python3
"""Audit the built site. Exits non-zero if anything is wrong.

Every check here exists because something actually broke, or because it would
have broken silently. Run it before pushing and in CI:

    python3 i18n/check.py            all checks
    python3 i18n/check.py --list     show the checklist without running

Checks needing fontTools are skipped with a warning if it is not installed;
CI installs it, so they run there.
"""
import base64, hashlib, json, os, re, sys
from collections import Counter, defaultdict
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from langs import LANGS, PAGES, prefix, by_code

# ---------------------------------------------------------------- test harness
class Result:
    def __init__(self):
        self.checks, self.failed, self.skipped = 0, [], []
    def check(self, name, ok, detail=""):
        self.checks += 1
        if ok:
            print(f"  \033[32mPASS\033[0m  {name}" + (f"  {detail}" if detail else ""))
        else:
            print(f"  \033[31mFAIL\033[0m  {name}  {detail}")
            self.failed.append((name, detail))
    def skip(self, name, why):
        self.skipped.append(name)
        print(f"  \033[33mSKIP\033[0m  {name}  ({why})")

R = Result()

def page_path(code, page):
    return os.path.join(SITE, prefix(code).lstrip("/"), page)

def all_pages():
    for l in LANGS:
        for p in PAGES:
            yield l, p, page_path(l["code"], p)

def read(p):
    return open(p, encoding="utf-8").read()

def strip_code(html):
    return re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)

def visible(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", strip_code(html)))

# =============================================================== 1. STRUCTURE
def structure():
    print("\n\033[1m1. Page structure\033[0m")
    missing = [f"{prefix(l['code'])}/{p}" for l, p, f in all_pages() if not os.path.exists(f)]
    R.check("every language has every page", not missing,
            f"{len(LANGS)*len(PAGES)} pages" if not missing else f"missing {missing}")

    bad = []
    for l, p, f in all_pages():
        s = read(f)
        if not s.lstrip().lower().startswith("<!doctype html>"): bad.append((p, l["code"], "doctype is not first"))
        m = re.search(r'<html lang="([^"]+)"', s)
        if not m: bad.append((p, l["code"], "no <html lang>"))
        elif m.group(1) != l["tag"]: bad.append((p, l["code"], f"lang={m.group(1)} expected {l['tag']}"))
        if 'charset="utf-8"' not in s: bad.append((p, l["code"], "no charset"))
    R.check("doctype, <html lang> and <meta charset> on every page", not bad,
            "" if not bad else f"{len(bad)} problems: {bad[:3]}")

    R.check("a 404 page exists", os.path.exists(os.path.join(SITE, "404.html")))

# ============================================================== 2. NAVIGATION
def navigation():
    print("\n\033[1m2. Language navigation\033[0m")
    bad = []
    for l, p, f in all_pages():
        s = read(f)
        flags = len(re.findall(r'<svg class="flag"', s))
        if flags != len(LANGS): bad.append((p, l["code"], f"{flags} flags"))
        cur = re.findall(r'aria-current="true" title="([^"]+)"', s)
        if len(cur) != 1: bad.append((p, l["code"], f"{len(cur)} aria-current"))
        elif cur[0] != l["native"]: bad.append((p, l["code"], f"active={cur[0]}"))
    R.check("language bar: all flags, exactly one marked current", not bad,
            "" if not bad else f"{len(bad)}: {bad[:3]}")

    bad = []
    for l, p, f in all_pages():
        s = read(f)
        tags = set(re.findall(r'<link rel="alternate" hreflang="([^"]+)"', s))
        want = {x["tag"] for x in LANGS} | {"x-default"}
        if tags != want: bad.append((p, l["code"], sorted(want - tags)))
    R.check("hreflang covers every language plus x-default", not bad,
            "" if not bad else f"{len(bad)}: {bad[:2]}")

    # the bar must link to the SAME page in the other languages
    bad = []
    for l, p, f in all_pages():
        s = read(f)
        bar = re.search(r'<div class="langbar">.*?</div>', s, re.S)
        hrefs = re.findall(r'href="([^"]+)"', bar.group(0)) if bar else []
        want = {f"{prefix(o['code'])}/{p}".replace("/index.html", "/") or "/"
                for o in LANGS if o["code"] != l["code"]}
        want = {w if w.startswith("/") else "/" + w for w in want}
        if set(hrefs) != want: bad.append((p, l["code"], sorted(want ^ set(hrefs))))
    R.check("language links point at the same page, not the home page", not bad,
            "" if not bad else f"{len(bad)}: {bad[:2]}")

# =================================================================== 3. LINKS
def links():
    print("\n\033[1m3. Links\033[0m")
    bad, n = [], 0
    for root, _, files in os.walk(SITE):
        if ".git" in root or "i18n" in root or "node_modules" in root: continue
        for fn in files:
            if not fn.endswith(".html"): continue
            page = os.path.join(root, fn)
            s = read(page)
            for h in re.findall(r'href="([^"]+)"', s) + re.findall(r'src="([^"]+)"', s):
                if h.startswith(("#", "http", "mailto:", "data:")): continue
                t = os.path.join(SITE, h.lstrip("/")) if h.startswith("/") \
                    else os.path.join(os.path.dirname(page), h)
                if t.endswith("/") or os.path.isdir(t): t = os.path.join(t, "index.html")
                n += 1
                if not os.path.exists(os.path.normpath(t)):
                    bad.append((os.path.relpath(page, SITE), h))
    R.check("every internal link resolves", not bad, f"{n} links" if not bad else f"{len(bad)}: {bad[:4]}")

    dupes = []
    for l, p, f in all_pages():
        ids = re.findall(r'\sid="([^"]+)"', read(f))
        d = [i for i, c in Counter(ids).items() if c > 1]
        if d: dupes.append((p, l["code"], d))
    R.check("no duplicate id attributes", not dupes, "" if not dupes else str(dupes[:3]))

# ===================================================== 4. CONTENT SECURITY POLICY
def csp():
    print("\n\033[1m4. Content Security Policy\033[0m")
    rules, cur = [], None
    for line in open(os.path.join(SITE, "_headers")):
        if line.startswith("/"): cur = line.strip(); continue
        if cur and "Content-Security-Policy" in line:
            rules.append((cur, line.split(":", 1)[1].strip())); cur = None
    match = lambda r, u: u.startswith(r[:-1]) if r.endswith("/*") else u == r

    urls = set()
    for l in LANGS:
        for p in PAGES:
            u = f"{prefix(l['code'])}/{p}"
            urls.add(u); urls.add(u.replace("/index.html", "/") or "/")
    bad = [u for u in urls if len([r for r, _ in rules if match(r, u)]) != 1]
    R.check("every URL matched by exactly one CSP rule", not bad,
            f"{len(urls)} URLs, {len(rules)} rules" if not bad else str(bad[:4]))

    blanket = re.search(r"^/\*$.*?(?=^/|\Z)", open(os.path.join(SITE, "_headers")).read(),
                        re.S | re.M)
    R.check("/* sets no CSP (two headers would be intersected by browsers)",
            "Content-Security-Policy" not in (blanket.group(0) if blanket else ""))

    weak = [r for r, pol in rules if "default-src 'none'" not in pol
            or "base-uri 'none'" not in pol or "frame-ancestors 'none'" not in pol]
    R.check("every policy locks default-src, base-uri and frame-ancestors", not weak,
            "" if not weak else str(weak[:3]))

    # least privilege: script-src present exactly when the page loads a script
    bad = []
    for l, p, f in all_pages():
        s = read(f)
        needs = bool(re.search(r'<script[^>]+src=', s))
        u = f"{prefix(l['code'])}/{p}".replace("/index.html", "/") or "/"
        pol = next((pol for r, pol in rules if match(r, u)), "")
        has = "script-src" in pol
        if needs != has: bad.append((u, f"loads script={needs}, script-src={has}"))
    R.check("script-src granted only to pages that load a script", not bad,
            "" if not bad else str(bad[:4]))

    # the font each page inlines must be permitted by that page's font-src
    bad = []
    for l, p, f in all_pages():
        s = read(f)
        u = f"{prefix(l['code'])}/{p}".replace("/index.html", "/") or "/"
        pol = next((pol for r, pol in rules if match(r, u)), "")
        if "font/woff2;base64" in s:
            fs = re.search(r"font-src ([^;]+)", pol)
            if not fs or "data:" not in fs.group(1):
                bad.append((u, "inlines a data: font but font-src lacks data:"))
    R.check("inlined fonts are permitted by the page's own font-src", not bad,
            "" if not bad else str(bad[:3]))

# =================================================================== 5. FONTS
def fonts():
    print("\n\033[1m5. Fonts\033[0m")
    ext = [(l["code"], p) for l, p, f in all_pages()
           if re.search(r'@font-face[^}]*url\((?!data:)', read(f))]
    R.check("no page loads an external font (the CSP forbids it)", not ext, str(ext[:3]))

    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        R.skip("every heading glyph is present in the page's font", "fontTools not installed")
        return

    bad = []
    for l in LANGS:
        idx = page_path(l["code"], "index.html")
        m = re.search(r"font/woff2;base64,([A-Za-z0-9+/=]+)", read(idx))
        if not m:
            bad.append((l["code"], "no inlined font")); continue
        tmp = f"/tmp/_chk_{l['code']}.woff2"
        open(tmp, "wb").write(base64.b64decode(m.group(1)))
        try:
            fo = TTFont(tmp)
        except ImportError as e:
            R.skip("every heading glyph is present in the page's font",
                   f"{e} — pip install brotli"); return
        except Exception as e:
            bad.append((l["code"], f"font will not parse: {e}")); continue
        cmap = set()
        for t in fo["cmap"].tables:
            try: cmap |= set(t.cmap.keys())
            except Exception: pass
        used = set()
        for p in PAGES:
            h = strip_code(read(page_path(l["code"], p)))
            for mm in re.finditer(r"<h[123][^>]*>(.*?)</h[123]>", h, re.S | re.I):
                used |= set(re.sub(r"<[^>]+>", " ", mm.group(1)))
        # CJK legitimately falls through to the system stack
        used = {c for c in used if c.isprintable() and c != " " and ord(c) < 0x2E80}
        miss = sorted(c for c in used if ord(c) not in cmap)
        if miss: bad.append((l["code"], f"missing {miss[:8]}"))
    R.check("every heading glyph is present in the page's font", not bad, str(bad[:3]))

# ======================================================= 6. TRANSLATION INTEGRITY
NUMS = re.compile(r"\d")
GROUPED = re.compile(r"\d[\d.,\u00a0\u202f ]*\d|\d")

def big_numbers(text):
    """Multiset of figures with 7+ digits, separators stripped. These are the
    on-chain quantities; anything shorter is a date, a percentage or a count."""
    out = Counter()
    for g in GROUPED.findall(text):
        d = re.sub(r"[^0-9]", "", g)
        if len(d) >= 7: out[d] += 1
    return out
PLACEHOLDER = re.compile(r"</?(\d+)/?>")
NEVER = ["DFV", "Deep Fucking Value", "Uniswap", "Etherscan", "MetaMask", "Telegram",
         "USDC", "ERC20", "claim()", "getClaimableAmount", "delegate()"]

def translations():
    print("\n\033[1m6. Translation integrity\033[0m")
    lock_p = os.path.join(HERE, "catalogue.en.lock.json")
    if not os.path.exists(lock_p):
        R.check("the English lockfile exists", False, "catalogue.en.lock.json missing"); return
    lock = json.load(open(lock_p, encoding="utf-8"))["strings"]
    R.check("the English lockfile exists", True, f"{len(lock)} strings")

    for l in LANGS:
        if l["code"] == "en": continue
        cp = os.path.join(HERE, f"catalogue.{l['code']}.json")
        if not os.path.exists(cp):
            R.check(f"{l['code']}: catalogue present", False, "missing"); continue
        cat = json.load(open(cp, encoding="utf-8"))

        extra = set(cat) - set(lock)
        R.check(f"{l['code']}: no keys absent from the lockfile", not extra, f"{len(extra)} orphans")

        ph_bad = [lock[k]["text"][:40] for k in cat if k in lock
                  and Counter(PLACEHOLDER.findall(lock[k]["text"])) != Counter(PLACEHOLDER.findall(cat[k]))]
        R.check(f"{l['code']}: placeholders match English exactly", not ph_bad, str(ph_bad[:2]))

        kept = [t for t in NEVER
                if any(t in lock[k]["text"] and t not in cat[k] for k in cat if k in lock)]
        R.check(f"{l['code']}: never-translate terms survive", not kept, str(kept))

        # Only LARGE figures are compared. Small numbers legitimately change
        # in translation: "20 Aug 2026" becomes "20/08/2026", "The 10
        # Commandments" becomes the Chinese numeral, and Spanish rescales
        # "138.84 billion" to the equally correct "138 840 millones". What must
        # never change is an exact on-chain quantity, and those all run to
        # seven digits or more. 
        dig_bad = []
        for k in cat:
            if k not in lock:
                continue
            if big_numbers(lock[k]["text"]) != big_numbers(cat[k]):
                dig_bad.append((lock[k]["text"][:44], cat[k][:44]))
        R.check(f"{l['code']}: large on-chain figures unaltered", not dig_bad, str(dig_bad[:2]))

    # A page can exist, validate, and still be entirely in English — which is
    # what happened when /raffle/ and /raffle/proof/ were added to PAGES but
    # never sent to a translator. Structure checks all passed while a French
    # visitor got an English page under a French URL.
    #
    # A string deliberately left in English (a brand name, an address) is
    # PRESENT in the catalogue and equal to the source. A string that was never
    # translated is ABSENT from it. That distinction is exact, so no percentage
    # threshold is needed.
    from finalize import strip_generated
    untranslated = []
    for l in LANGS:
        if l["code"] == "en": continue
        cat = json.load(open(os.path.join(HERE, f"catalogue.{l['code']}.json"), encoding="utf-8"))
        for page in PAGES:
            src = strip_generated(read(os.path.join(SITE, page)))
            spans = __import__("site_i18n").locate(src)
            if not spans: continue
            absent = [sp for sp in spans if hashlib.sha1(sp["text"].encode()).hexdigest()[:10] not in cat]
            if len(absent) > len(spans) * 0.5:
                untranslated.append((page, l["code"], f"{len(absent)}/{len(spans)} strings never sent to a translator"))
    R.check("no page is missing from the translation catalogues", not untranslated,
            "" if not untranslated else f"{len(untranslated)} page/language pairs: {untranslated[:3]}")

    # <option value="..."> must never be translated: the JS compares against it
    sitemod = __import__("site_i18n")
    src = read(os.path.join(SITE, "memes/index.html"))
    vals = re.findall(r'<option value="([^"]+)"', src)
    bad = []
    for l in LANGS:
        if l["code"] == "en": continue
        got = re.findall(r'<option value="([^"]+)"', read(page_path(l["code"], "memes/index.html")))
        if got != vals: bad.append((l["code"], got))
    R.check("<option value> identical in every language (the JS compares it)", not bad, str(bad[:2]))

# ==================================================== 7. CONTENT EQUIVALENCE
def equivalence():
    print("\n\033[1m7. Content equivalence across languages\033[0m")
    addr = re.compile(r"0x[0-9a-fA-F]{40}")
    bad_addr, bad_blob, bad_tags = [], [], []
    for p in PAGES:
        base = read(page_path("en", p))
        want_addr = Counter(addr.findall(base))
        want_blob = base.count("base64,")
        want_tags = len(re.findall(r"<[a-zA-Z/!][^>]*>", base))
        for l in LANGS:
            if l["code"] == "en": continue
            s = read(page_path(l["code"], p))
            if Counter(addr.findall(s)) != want_addr: bad_addr.append((p, l["code"]))
            if s.count("base64,") != want_blob: bad_blob.append((p, l["code"]))
            if abs(len(re.findall(r"<[a-zA-Z/!][^>]*>", s)) - want_tags) > 0:
                bad_tags.append((p, l["code"]))
    R.check("contract addresses identical in every language", not bad_addr, str(bad_addr[:3]))
    R.check("same number of embedded assets in every language", not bad_blob, str(bad_blob[:3]))
    R.check("same markup structure in every language", not bad_tags, str(bad_tags[:3]))

    # alt text should be translated, not left in English
    miss = []
    for l in LANGS:
        if l["code"] == "en": continue
        for p in PAGES:
            en_alt = re.findall(r'\salt="([^"]*)"', read(page_path("en", p)))
            tr_alt = re.findall(r'\salt="([^"]*)"', read(page_path(l["code"], p)))
            if len(en_alt) != len(tr_alt): miss.append((p, l["code"], "count differs"))
    R.check("every image keeps its alt text in every language", not miss, str(miss[:3]))

# =============================================================== 8. BUILD
def build_is_idempotent():
    print("\n\033[1m8. Build\033[0m")
    def snapshot():
        h = hashlib.sha256()
        for root, _, files in sorted(os.walk(SITE)):
            if ".git" in root or "node_modules" in root: continue
            for fn in sorted(files):
                if fn.endswith(".html"):
                    h.update(open(os.path.join(root, fn), "rb").read())
        return h.hexdigest()
    before = snapshot()
    rc = os.system(f'cd "{SITE}" && python3 i18n/finalize.py >/dev/null 2>&1')
    R.check("the build succeeds", rc == 0)
    R.check("rebuilding changes nothing (the build is idempotent)", snapshot() == before,
            "" if snapshot() == before else "a rebuild altered the output")

# ================================================================== run
CHECKLIST = [
    ("1. Page structure", structure),
    ("2. Language navigation", navigation),
    ("3. Links", links),
    ("4. Content Security Policy", csp),
    ("5. Fonts", fonts),
    ("6. Translation integrity", translations),
    ("7. Content equivalence", equivalence),
    ("8. Build", build_is_idempotent),
]

if __name__ == "__main__":
    if "--list" in sys.argv:
        for name, _ in CHECKLIST: print(" ", name)
        sys.exit(0)
    print("\033[1mDFV site audit\033[0m")
    for _, fn in CHECKLIST:
        fn()
    print(f"\n\033[1m{R.checks} checks, {len(R.failed)} failed, {len(R.skipped)} skipped\033[0m")
    for name, detail in R.failed:
        print(f"  \033[31m✗\033[0m {name}: {detail}")
    sys.exit(1 if R.failed else 0)
