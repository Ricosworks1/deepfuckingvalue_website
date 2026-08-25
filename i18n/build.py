#!/usr/bin/env python3
"""Extract the English catalogue, or build a translated mirror of the site.

  python3 i18n/build.py extract
  python3 i18n/build.py inject fr
"""
import json, os, re, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = ROOT
sys.path.insert(0, HERE)
from site_i18n import locate, render, h

PAGES = ["index.html", "claim/index.html", "dao/index.html",
         "leaderboard/index.html", "memes/index.html", "memes/gallery/index.html"]

def extract():
    strings, occ = {}, {}
    for p in PAGES:
        src = open(os.path.join(SITE, p), encoding="utf-8").read()
        spans = locate(src)
        rows = []
        for s in spans:
            k = h(s["text"])
            strings.setdefault(k, {"text": s["text"], "kind": s["kind"]})
            rows.append({"hash": k, "kind": s["kind"]})
        occ[p] = rows
        print(f"  {p:28} {len(rows):>4} occurrences")
    out = os.path.join(HERE, "catalogue.en.json")
    json.dump({"strings": strings, "occurrences": occ}, open(out, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    words = sum(len(v["text"].split()) for v in strings.values())
    blocks = sum(1 for v in strings.values() if v["kind"] == "block")
    print(f"\n  {len(strings)} unique strings ({blocks} with inline markup), {words} words")
    print(f"  -> {out}")

def inject(lang):
    cat = json.load(open(os.path.join(HERE, f"catalogue.{lang}.json"), encoding="utf-8"))
    mapping = cat["strings"] if isinstance(next(iter(cat["strings"].values())), str) else \
              {k: v["text"] for k, v in cat["strings"].items()}
    dest = os.path.join(SITE, lang)
    for p in PAGES:
        src = open(os.path.join(SITE, p), encoding="utf-8").read()
        out, spans = render(src, mapping)
        done = sum(1 for s in spans if mapping.get(h(s["text"])) not in (None, s["text"]))
        target = os.path.join(dest, p)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        open(target, "w", encoding="utf-8").write(out)
        print(f"  {lang}/{p:26} {done:>4}/{len(spans)} strings translated")
    # copy the page-local scripts unchanged; they are translated separately
    for js in ["claim/app.js", "dao/app.js", "memes/app.js", "memes/gallery/app.js"]:
        s, d = os.path.join(SITE, js), os.path.join(dest, js)
        if os.path.exists(s):
            os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy2(s, d)

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "extract"
    if cmd == "extract": extract()
    elif cmd == "inject": inject(sys.argv[2])
    else: print(__doc__)
