"""The languages the site ships in, and how each one is presented."""

LANGS = [
    {"code": "en", "tag": "en",      "name": "English",    "native": "English",    "font": "ad"},
    {"code": "fr", "tag": "fr",      "name": "French",     "native": "Français",   "font": "ad"},
    {"code": "de", "tag": "de",      "name": "German",     "native": "Deutsch",    "font": "ad"},
    {"code": "es", "tag": "es",      "name": "Spanish",    "native": "Español",    "font": "ad"},
    {"code": "vi", "tag": "vi",      "name": "Vietnamese", "native": "Tiếng Việt", "font": "ph"},
    {"code": "zh", "tag": "zh-Hans", "name": "Chinese",    "native": "简体中文",     "font": "cjk"},
]

# Which handwriting face each language gets, and why.
#   ad  Architects Daughter  - the site's own face. Covers en/fr/de/es completely.
#   ph  Patrick Hand         - Architects Daughter has NO Vietnamese glyphs (Google ships
#                              only latin and latin-ext; Vietnamese needs U+1EA0-U+1EF1).
#                              Patrick Hand ships a vietnamese subset and reads the same way.
#   cjk system stack         - no handwritten CJK webfont exists at a sane size, and the site's
#                              CSP is font-src data:, so a CDN font could never load anyway.
FONT_FAMILY = {"ad": "Architects Daughter", "ph": "Patrick Hand"}
CJK_STACK = ('"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", '
             '"Noto Sans CJK SC", "Source Han Sans SC", sans-serif')

PAGES = ["index.html", "claim/index.html", "dao/index.html",
         "leaderboard/index.html", "memes/index.html", "memes/gallery/index.html"]

def by_code(code):
    return next(l for l in LANGS if l["code"] == code)

def prefix(code):
    """URL prefix for a language. English stays at the root."""
    return "" if code == "en" else f"/{code}"
