"""Inline SVG flags for the language switcher.

Not emoji. Windows ships no glyphs for the regional-indicator pairs, so an
emoji flag renders there as two bare letters — "GB", "FR" — which looks broken
for a large share of visitors. Inline SVG renders identically everywhere, needs
no font, and costs a couple of kilobytes for the set.

A flag is a country, not a language, so each link still carries the language
name in title= and aria-label= for screen readers and hover.
"""

STAR = ("M0,-1L.225-.309.951-.309.363.118.588.809 0 .382-.588.809-.363.118"
        "-.951-.309-.225-.309Z")

def _wrap(body):
    return ('<svg class="flag" viewBox="0 0 24 16" width="30" height="20" '
            'aria-hidden="true" focusable="false">' + body +
            '<rect x=".25" y=".25" width="23.5" height="15.5" rx="1.5" fill="none" '
            'stroke="rgba(0,0,0,.28)" stroke-width=".5"/></svg>')

FLAGS = {
    # France: three vertical bands
    "fr": _wrap('<rect width="24" height="16" fill="#fff" rx="2"/>'
                '<path d="M0 2a2 2 0 012-2h6v16H2a2 2 0 01-2-2z" fill="#002654"/>'
                '<path d="M16 0h6a2 2 0 012 2v12a2 2 0 01-2 2h-6z" fill="#ED2939"/>'),

    # Germany: three horizontal bands
    "de": _wrap('<path d="M0 2a2 2 0 012-2h20a2 2 0 012 2v3.33H0z" fill="#000"/>'
                '<rect y="5.33" width="24" height="5.34" fill="#DD0000"/>'
                '<path d="M0 10.67h24V14a2 2 0 01-2 2H2a2 2 0 01-2-2z" fill="#FFCE00"/>'),

    # Spain: red, yellow, red (1:2:1), without the arms
    "es": _wrap('<path d="M0 2a2 2 0 012-2h20a2 2 0 012 2v2H0z" fill="#AA151B"/>'
                '<rect y="4" width="24" height="8" fill="#F1BF00"/>'
                '<path d="M0 12h24v2a2 2 0 01-2 2H2a2 2 0 01-2-2z" fill="#AA151B"/>'),

    # Vietnam: one yellow star on red
    "vi": _wrap('<rect width="24" height="16" rx="2" fill="#DA251D"/>'
                f'<path d="{STAR}" fill="#FF0" transform="translate(12 8) scale(4.6)"/>'),

    # China: one large star with four small ones arcing round it
    "zh": _wrap('<rect width="24" height="16" rx="2" fill="#DE2910"/>'
                f'<path d="{STAR}" fill="#FFDE00" transform="translate(5 5) scale(3)"/>'
                f'<path d="{STAR}" fill="#FFDE00" transform="translate(10.2 2.2) scale(1.05)"/>'
                f'<path d="{STAR}" fill="#FFDE00" transform="translate(12.2 4.6) scale(1.05)"/>'
                f'<path d="{STAR}" fill="#FFDE00" transform="translate(12.2 7.6) scale(1.05)"/>'
                f'<path d="{STAR}" fill="#FFDE00" transform="translate(10.2 9.8) scale(1.05)"/>'),

    # United Kingdom: the Union Flag
    "en": _wrap('<clipPath id="dfvuk"><rect width="24" height="16" rx="2"/></clipPath>'
                '<g clip-path="url(#dfvuk)">'
                '<rect width="24" height="16" fill="#012169"/>'
                '<path d="M0 0l24 16M24 0L0 16" stroke="#fff" stroke-width="3.2"/>'
                '<path d="M0 0l24 16M24 0L0 16" stroke="#C8102E" stroke-width="1.9"/>'
                '<path d="M12 0v16M0 8h24" stroke="#fff" stroke-width="5.3"/>'
                '<path d="M12 0v16M0 8h24" stroke="#C8102E" stroke-width="3.2"/></g>'),
}

def flag(code):
    return FLAGS.get(code, "")
