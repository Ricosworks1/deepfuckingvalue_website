#!/usr/bin/env python3
"""Locate, extract and re-inject translatable strings in the DFV site.

One locator serves both extraction and injection, so the two can never drift
apart. Everything is done by byte offset on the raw source: markup, base64
blobs, inline CSS and script bodies are copied verbatim and cannot be touched.

Three kinds of span:
  text   a bare text node
  attr   an allowlisted attribute value
  block  a block element whose inner HTML mixes text with inline markup, e.g.
         "Holding DFV gives you <strong>no voting power</strong> until ...".
         These are extracted whole, with inline tags reduced to numbered
         placeholders <0>...</0>, so a translator can reorder them freely.
         Translating the fragments separately would break every language whose
         word order differs from English, which is all three of ours.
"""
import hashlib, json, os, re, sys
from html.parser import HTMLParser

SKIP_TAGS = {"script", "style", "code", "pre", "svg"}
# NOT "value": <option value="impact"> is a machine identifier the meme-maker
# JS reads back, not visible text. Translating it silently breaks the style,
# cat-position and animation selects. The visible label is the option's text
# node, which is captured separately and correctly.
ATTRS = {"alt", "title", "placeholder", "aria-label", "content"}
CONTENT_META = {"description", "og:title", "og:description", "twitter:title", "twitter:description"}
INLINE = "a|em|strong|b|i|span|code|small|sup|sub|abbr|u|s|mark"
BLOCK = "p|h1|h2|h3|h4|h5|h6|li|td|th|button|label|figcaption|blockquote|dt|dd|summary"
NOT_TEXT = re.compile(r"""^[\s\d.,:;%+\-—–/()\[\]|$€£¥×·•…"'`~^*=<>@#&_]*$""")
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{2,}(?:[.…]{1,3}[0-9a-fA-F]{2,})?$")

def translatable(s):
    t = s.strip()
    return (len(t) >= 2 and not NOT_TEXT.match(t)
            and not ADDRESS.match(t) and bool(re.search(r"[A-Za-z]", t)))

def h(s): return hashlib.sha1(s.encode()).hexdigest()[:10]
def esc_text(s): return s.replace("&", "&amp;").replace("<", "&lt;")
def esc_attr(s, q):
    s = s.replace("&", "&amp;").replace("<", "&lt;")
    return s.replace('"', "&quot;") if q == '"' else s.replace("'", "&#39;")

# ---------------------------------------------------------------- placeholders
def to_placeholders(inner):
    """<strong>x</strong> -> <0>x</0>, returning the original opening tags."""
    tags, out, i = [], "", 0
    pat = re.compile(rf"<({INLINE})\b([^>]*)>|</({INLINE})\s*>|<br\s*/?>", re.I)
    depth = []
    while i < len(inner):
        m = pat.search(inner, i)
        if not m:
            out += inner[i:]; break
        out += inner[i:m.start()]
        if m.group(0).lower().startswith("<br"):
            tags.append(m.group(0)); out += f"<{len(tags)-1}/>"
        elif m.group(1):
            tags.append(m.group(0)); n = len(tags) - 1
            depth.append(n); out += f"<{n}>"
        else:
            out += f"</{depth.pop()}>" if depth else ""
        i = m.end()
    return out.strip(), tags

def from_placeholders(s, tags):
    def open_tag(m):
        n = int(m.group(1))
        return tags[n] if n < len(tags) else ""
    def close_tag(m):
        n = int(m.group(1))
        if n >= len(tags): return ""
        name = re.match(r"<\s*([a-zA-Z0-9]+)", tags[n]).group(1)
        return f"</{name}>"
    s = re.sub(r"<(\d+)/>", lambda m: tags[int(m.group(1))] if int(m.group(1)) < len(tags) else "", s)
    s = re.sub(r"</(\d+)>", close_tag, s)
    s = re.sub(r"<(\d+)>", open_tag, s)
    return s

# --------------------------------------------------------------------- locator
def mixed_blocks(src):
    """Inner spans of block elements that mix text with inline markup."""
    clean = re.sub(r"<(script|style)\b.*?</\1>", lambda m: " " * len(m.group(0)), src, flags=re.S | re.I)
    spans = []
    for m in re.finditer(rf"<({BLOCK})\b[^>]*>(.*?)</\1>", clean, re.S | re.I):
        inner = m.group(2)
        if not re.search(rf"<({INLINE})\b", inner, re.I): continue
        outside = re.sub(rf"<({INLINE})\b[^>]*>.*?</\1>", "", inner, flags=re.S | re.I)
        outside = re.sub(r"<[^>]+>", "", outside)
        if len(outside.strip()) < 2 or not re.search(r"[A-Za-z]", outside): continue
        if re.search(rf"<({BLOCK})\b", inner, re.I): continue        # nested block: leave to inner pass
        spans.append((m.start(2), m.end(2)))
    return spans

class Locator(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src, self.skip, self.stack, self.spans = src, 0, [], []
        self.lines = [0]
        for line in src.splitlines(keepends=True):
            self.lines.append(self.lines[-1] + len(line))
        self.blocks = mixed_blocks(src)

    def in_block(self, pos):
        return any(a <= pos < b for a, b in self.blocks)

    def off(self):
        l, c = self.getpos(); return self.lines[l - 1] + c

    def handle_starttag(self, tag, attrs):
        d, raw, base = dict(attrs), self.get_starttag_text() or "", self.off()
        if not self.skip:
            for k, v in attrs:
                if k not in ATTRS or not v: continue
                if k == "content":
                    if (d.get("name") or d.get("property") or "") not in CONTENT_META: continue
                if not translatable(v): continue
                m = re.search(re.escape(k) + r'\s*=\s*(["\'])' + re.escape(v) + r"\1", raw)
                if not m: continue
                q = m.group(1)
                vs = base + m.start() + m.group(0).index(q) + 1
                self.spans.append({"start": vs, "end": vs + len(v), "text": v, "kind": "attr", "quote": q})
        if tag in SKIP_TAGS or d.get("data-i18n") == "skip": self.skip += 1
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1] == tag: self.stack.pop()
        if tag in SKIP_TAGS and self.skip: self.skip -= 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1] == tag: self.stack.pop()
        if tag in SKIP_TAGS and self.skip: self.skip -= 1

    def handle_data(self, data):
        if self.skip or not translatable(data): return
        start = self.off()
        lead = len(data) - len(data.lstrip())
        if self.in_block(start + lead): return          # handled as a whole block
        self.spans.append({"start": start + lead, "end": start + lead + len(data.strip()),
                           "text": data.strip(), "kind": "text", "quote": None})

def locate(src):
    loc = Locator(src); loc.feed(src)
    spans = list(loc.spans)
    for a, b in loc.blocks:
        ph, tags = to_placeholders(src[a:b])
        if translatable(re.sub(r"</?\d+/?>", "", ph)):
            spans.append({"start": a, "end": b, "text": ph, "kind": "block", "quote": None, "tags": tags})
    return sorted(spans, key=lambda s: s["start"])

NUM = re.compile(r"\d[\d,. \u00a0\u202f]*\d|\d")

def mask_numbers(text):
    """The sentence with every number replaced by #, so a translation survives
    the nightly rebuild changing the figures inside it."""
    return NUM.sub("#", text)

def regroup(new_digits, like):
    """Write new_digits using the grouping style of `like`, so a French
    '117 490 583 691' stays French when the value changes."""
    sep = next((c for c in like if c in ",. \u00a0\u202f"), "")
    dec = ""
    if "." in new_digits and (like.count(",") > like.count(".") or "," in like):
        pass
    plain = re.sub(r"[^\d]", "", new_digits)
    if not sep or sep.isdigit():
        return plain
    groups = []
    while len(plain) > 3:
        groups.insert(0, plain[-3:]); plain = plain[:-3]
    groups.insert(0, plain)
    return sep.join(groups)

def build_fuzzy(mapping, english):
    """masked English -> (original English, translation). Used only when the
    exact hash misses."""
    idx = {}
    for key, en_text in english.items():
        tr = mapping.get(key)
        if tr and NUM.search(en_text):
            idx.setdefault(mask_numbers(en_text), (en_text, tr))
    return idx

def fuzzy_lookup(text, fuzzy):
    hit = fuzzy.get(mask_numbers(text))
    if not hit:
        return None
    old_en, tr = hit
    old_nums = NUM.findall(old_en)
    new_nums = NUM.findall(text)
    tr_nums = NUM.findall(tr)
    if not (len(old_nums) == len(new_nums) == len(tr_nums)):
        return None
    out, i = [], 0
    for part in NUM.split(tr):
        out.append(part)
        if i < len(tr_nums):
            out.append(regroup(new_nums[i], tr_nums[i])); i += 1
    return "".join(out)

def render(src, mapping, fuzzy=None):
    spans = locate(src)
    out = src
    for s in sorted(spans, key=lambda s: s["start"], reverse=True):
        new = mapping.get(h(s["text"]))
        if new is None and fuzzy:
            new = fuzzy_lookup(s["text"], fuzzy)
        if new is None or new == s["text"]: continue
        if s["kind"] == "attr":   rep = esc_attr(new, s["quote"])
        elif s["kind"] == "block": rep = from_placeholders(new, s["tags"])
        else:                      rep = esc_text(new)
        out = out[:s["start"]] + rep + out[s["end"]:]
    return out, spans
