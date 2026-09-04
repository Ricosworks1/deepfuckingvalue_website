#!/usr/bin/env python3
"""Build every language mirror of the site.

  python3 i18n/finalize.py            build all languages that have a catalogue
  python3 i18n/finalize.py en fr      build only these

For each page it:
  - injects the translated strings (English passes through untouched)
  - adds a doctype, <html lang> and <meta charset> - the site currently declares
    NO charset and relies entirely on Cloudflare's response header, which would
    turn Chinese and Vietnamese into mojibake anywhere else
  - adds rel=alternate hreflang for every language, plus x-default
  - rewrites absolute internal links onto the language prefix
  - inserts a no-JavaScript language switcher (it must be plain <a> links:
    /leaderboard/ has no script-src at all in the CSP, so JS cannot run there)
  - replaces the @font-face with a face subsetted to the glyphs that page uses
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = ROOT
sys.path.insert(0, HERE)
from site_i18n import render, h, build_fuzzy
from langs import LANGS, PAGES, by_code, prefix, FONT_FAMILY
from flags import flag
import fonts

# Output goes straight into the deployed tree. The English pages are both the
# source and one of the outputs, so everything this script inserts is wrapped in
# markers and stripped before re-inserting. Running the build twice is therefore
# identical to running it once.
OUT = SITE

HEAD_OPEN, HEAD_CLOSE = "<!doctype html><!--i18n:head-->", "<!--/i18n:head-->"
BAR_OPEN, BAR_CLOSE = "<!--i18n:langbar-->", "<!--/i18n:langbar-->"
CSS_OPEN, CSS_CLOSE = "/*i18n:css*/", "/*/i18n:css*/"

def strip_generated(html):
    """Undo a previous run, so the source is recovered exactly.

    Each marker also swallows the one newline the inserter puts beside it -
    otherwise blank lines accumulate one per build and the output is never
    byte-stable. selftest() below checks exactly this."""
    e = re.escape
    html = re.sub(e(HEAD_OPEN) + r".*?" + e(HEAD_CLOSE) + r"\n?", "", html, flags=re.S)
    html = re.sub(r"\n?" + e(BAR_OPEN) + r".*?" + e(BAR_CLOSE), "", html, flags=re.S)
    html = re.sub(e(CSS_OPEN) + r".*?" + e(CSS_CLOSE), "", html, flags=re.S)
    return html

SWITCHER_CSS = """
  .langbar { background: var(--paper-sunk); border-bottom: 1px solid var(--pale); }
  .langbar ul { margin: 0 auto; padding: 0.4rem 1rem; list-style: none;
                display: flex; justify-content: center; flex-wrap: wrap; gap: 0.35rem; }
  .langbar li { margin: 0; display: flex; }
  /* padding gives a ~44px tap target around a 30px flag, which is the mobile
     guideline; the flag itself stays small enough not to shout. */
  .langbar a, .langbar span { display: block; line-height: 0; border-radius: 4px;
                              padding: 7px 6px; border: 1px solid transparent; }
  .langbar .flag { display: block; border-radius: 2px; }
  .langbar a { opacity: 0.45; transition: opacity 0.12s ease; }
  .langbar a:hover, .langbar a:focus-visible { opacity: 1; }
  .langbar a:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }
  .langbar [aria-current="true"] { opacity: 1; border-color: var(--red); }
"""

def switcher(active, page):
    """Flags only, centred. A flag is a country and not a language, so the
    name still rides along in title= and aria-label= for hover and for screen
    readers - the visual is a flag, the accessible name is the language."""
    items = []
    for l in LANGS:
        href = f"{prefix(l['code'])}/{page}".replace("/index.html", "/")
        if not href.startswith("/"): href = "/" + href
        svg, name = flag(l["code"]), l["native"]
        if l["code"] == active:
            items.append(f'<li><span aria-current="true" title="{name}" '
                         f'aria-label="{name}">{svg}</span></li>')
        else:
            items.append(f'<li><a href="{href}" hreflang="{l["tag"]}" title="{name}" '
                         f'aria-label="{name}">{svg}</a></li>')
    return ('<div class="langbar"><nav aria-label="Language"><ul>'
            f'{"".join(items)}</ul></nav></div>')

def hreflangs(page):
    out = []
    for l in LANGS:
        href = f"https://dfv.fun{prefix(l['code'])}/{page}".replace("/index.html", "/")
        out.append(f'<link rel="alternate" hreflang="{l["tag"]}" href="{href}">')
    out.append(f'<link rel="alternate" hreflang="x-default" href="https://dfv.fun/{page}">'
               .replace("/index.html", "/"))
    return "\n".join(out)

# Every page family that has language mirrors. A family missing from this
# list keeps its English href in all five mirrors, so a French reader
# clicking it lands back on the English site - which is exactly what
# happened to /raffle/ until it was added here.
INTERNAL = re.compile(r'href="(/(?:claim|dao|leaderboard|memes|raffle)/[^"]*|/)"')
# A bare filename with no slash, e.g. href="trades.csv" on the leaderboard.
# These are data files that exist once, at the English path, and are rebuilt
# nightly by the GitHub Action. A language mirror must point at that one copy
# rather than expect a duplicate beside it.
RELATIVE_FILE = re.compile(r'href="(?!#|/|https?:|mailto:|data:)([^"/]+\.[a-z0-9]+)"', re.I)

def relink(html, code, page):
    if code == "en":
        return html
    p = prefix(code)
    html = INTERNAL.sub(lambda m: f'href="{p}{m.group(1)}"', html)
    page_dir = os.path.dirname(page)
    base = "/" + (page_dir + "/" if page_dir else "")
    return RELATIVE_FILE.sub(lambda m: f'href="{base}{m.group(1)}"', html)

def visible_chars(html):
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return set(s)

def build(code):
    L = by_code(code)
    cat = {}
    if code != "en":
        p = os.path.join(HERE, f"catalogue.{code}.json")
        if not os.path.exists(p):
            p = os.path.join(HERE, f"catalogue.{code}.draft.json")
        if not os.path.exists(p):
            print(f"  {code}: no catalogue, skipped"); return 0
        raw = json.load(open(p, encoding="utf-8"))
        cat = raw if isinstance(next(iter(raw.values())), str) else {k: v["text"] for k, v in raw.items()}

    # The nightly leaderboard/DAO rebuild changes the figures inside sentences,
    # which changes their hash and would silently drop the translation. This
    # index lets a lookup miss fall back to the same sentence with its numbers
    # masked, then writes the current figures back in the target locale's style.
    # catalogue.en.lock.json is the English text as it stood when the
    # translations were made. The live catalogue.en.json drifts every night as
    # the leaderboard and DAO pages are rebuilt with new figures; the lock is
    # what lets a changed sentence still find its translation.
    lock_path = os.path.join(HERE, "catalogue.en.lock.json")
    fuzzy = None
    if cat and os.path.exists(lock_path):
        lock = json.load(open(lock_path, encoding="utf-8"))["strings"]
        fuzzy = build_fuzzy(cat, {k: v["text"] for k, v in lock.items()})

    # one font for the whole language: the union of glyphs across its pages
    rendered = {}
    glyphs = set()
    for page in PAGES:
        src = strip_generated(open(os.path.join(SITE, page), encoding="utf-8").read())
        out, spans = render(src, cat, fuzzy)
        rendered[page] = (out, spans)
        glyphs |= visible_chars(out)

    font_note = ""
    n_done = 0
    for page in PAGES:
        out, spans = rendered[page]
        done = sum(1 for s in spans
                   if (cat.get(h(s["text"])) or (fuzzy and __import__("site_i18n").fuzzy_lookup(s["text"], fuzzy)))
                   not in (None, s["text"]))
        n_done += done

        out, font_note = fonts.apply(out, L["font"], "".join(sorted(glyphs)))
        out = relink(out, code, page)

        # style for the switcher, appended to the page's own <style>
        out = re.sub(r"</style>", CSS_OPEN + SWITCHER_CSS + CSS_CLOSE + "</style>", out, count=1)
        # switcher goes immediately after the stylesheet, before any content
        out = re.sub(r"</style>", "</style>\n" + BAR_OPEN + switcher(code, page) + BAR_CLOSE,
                     out, count=1)

        prologue = (f'{HEAD_OPEN}\n<html lang="{L["tag"]}">\n'
                    f'<meta charset="utf-8">\n{hreflangs(page)}{HEAD_CLOSE}\n')
        out = prologue + out

        target = os.path.join(OUT, prefix(code).lstrip("/"), page)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        open(target, "w", encoding="utf-8").write(out)

    # page-local scripts ride along unchanged
    import shutil
    if code != "en":
        for js in ["claim/app.js", "dao/app.js", "memes/app.js", "memes/gallery/app.js",
                   "raffle/app.js"]:
            s = os.path.join(SITE, js)
            if os.path.exists(s):
                d = os.path.join(OUT, prefix(code).lstrip("/"), js)
                os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy2(s, d)

    total = sum(len(s) for _, s in rendered.values())
    print(f"  {code:3} {L['native']:12} {n_done:>4}/{total} strings   font: {font_note}")
    return n_done

def copy_static():
    """Nothing to copy: output is the site itself, so assets are already in place."""
    return

def write_404():
    """The site currently has NO 404: every unknown path returns the English
    homepage with HTTP 200, which search engines read as a soft 404."""
    links = "\n      ".join(
        f'<li><a href="{prefix(l["code"]) or ""}/" hreflang="{l["tag"]}" lang="{l["tag"]}">{l["native"]}</a></li>'
        for l in LANGS)
    tpl = open(os.path.join(HERE, "404.template.html"), encoding="utf-8").read()
    open(os.path.join(OUT, "404.html"), "w", encoding="utf-8").write(tpl.replace("{{LANGS}}", links))

if __name__ == "__main__":
    codes = sys.argv[1:] or [l["code"] for l in LANGS]
    os.makedirs(OUT, exist_ok=True)
    for c in codes:
        build(c)
    copy_static()
    write_404()
    import headers
    open(os.path.join(OUT, "_headers"), "w").write(headers.build())
    print(f"\n  build complete -> {OUT}")
