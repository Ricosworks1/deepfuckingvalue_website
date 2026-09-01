"""Fetch a handwriting font subsetted to exactly the characters a language uses.

The site inlines its font as a data: URI because its CSP is `font-src data:` -
no CDN font can ever load. So the font must be small, and the obvious way to
make it small is Google Fonts' own `text=` parameter, which returns a face
containing only the glyphs you ask for.

This also repairs a live bug: the site currently inlines Google's `latin-ext`
subset, which contains Latin Extended-A and NO basic ASCII. 'Architects
Daughter' has therefore never rendered the English headings at all - they fall
back to Bradley Hand on macOS and Segoe Print on Windows.
"""
import base64, hashlib, re, urllib.parse, urllib.request, os, json

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "cache")

def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

# Always include these, whatever the current copy happens to contain. Subsetting
# to exactly today's text is brittle: the leaderboard and DAO pages are
# regenerated nightly, and a single new character would silently fall back to a
# different face mid-heading. The insurance costs a couple of kilobytes.
BASE = ("".join(chr(c) for c in range(0x20, 0x7F))          # printable ASCII
        + "\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00b7\u2022"   # quotes, dashes, ellipsis, bullets
        + "\u2190\u2191\u2192\u2193\u00d7\u00f7\u00b0\u2248\u2260\u2264\u2265"  # arrows, maths
        + "\u20ac\u00a3\u00a5\u00a2\u00a9\u00ae\u2122\u00a0")          # currency, marks

def subset_b64(family: str, chars: str) -> tuple[str, int]:
    """Return (base64 woff2, raw byte size) for `family` limited to `chars`."""
    chars = chars + BASE
    os.makedirs(CACHE, exist_ok=True)
    wanted = "".join(sorted(set(chars) - set("\r\n\t")))
    # hashlib, not hash(): Python randomises string hashing per process, so a
    # hash()-based filename never hits the cache across runs and every build
    # would re-fetch from Google Fonts. In CI that is a nightly dependency on
    # a third party being up.
    digest = hashlib.sha1(wanted.encode()).hexdigest()[:16]
    key = os.path.join(CACHE, f"{family.replace(' ', '')}-{digest}.woff2")
    if os.path.exists(key):
        raw = open(key, "rb").read()
        return base64.b64encode(raw).decode(), len(raw)

    css = _get("https://fonts.googleapis.com/css2?family="
               + urllib.parse.quote(family.replace(" ", "+"), safe="+")
               + "&text=" + urllib.parse.quote(wanted)).decode()
    urls = re.findall(r"url\((https://[^)]+)\)", css)
    if not urls:
        raise RuntimeError(f"Google Fonts returned no font for {family}: {css[:200]}")
    # text= subsetting returns a single face; if it ever splits, take them all
    raw = _get(urls[0])
    open(key, "wb").write(raw)
    return base64.b64encode(raw).decode(), len(raw)

FACE = """@font-face {
    font-family: '%s';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url(data:font/woff2;base64,%s) format('woff2');
  }"""

FACE_RE = re.compile(r"@font-face\s*\{.*?\}", re.S)

def apply(html: str, font_kind: str, chars: str) -> tuple[str, str]:
    """Swap the page's @font-face for one that actually covers `chars`."""
    from langs import FONT_FAMILY, CJK_STACK
    if font_kind == "cjk":
        # No handwritten CJK face exists at a usable size, so Chinese characters
        # come from the system stack. But the page still contains Latin - the
        # brand "Deep Fucking Value", "DFVNomics", "DAO" - and that should keep
        # the site's own hand. Font fallback is per-character: the browser uses
        # Architects Daughter for glyphs it has and falls through to the CJK
        # stack for the rest. So keep the Latin face and chain the stack behind it.
        latin_only = "".join(c for c in chars if ord(c) < 0x2E80)
        b64, size = subset_b64(FONT_FAMILY["ad"], latin_only)
        html = FACE_RE.sub(lambda m: FACE % (FONT_FAMILY["ad"], b64), html, count=1)
        html = re.sub(r"--f-hand:[^;]*;",
                      f"--f-hand: 'Architects Daughter', {CJK_STACK};", html, count=1)
        return html, f"Architects Daughter for Latin ({size:,} B) + system CJK stack"
    family = FONT_FAMILY[font_kind]
    b64, size = subset_b64(family, chars)
    html = FACE_RE.sub(lambda m: FACE % (family, b64), html, count=1)
    if font_kind != "ad":
        html = re.sub(r"--f-hand:\s*'[^']*'", f"--f-hand: '{family}'", html, count=1)
    return html, f"{family}, {size:,} B for {len(set(chars))} glyphs"
