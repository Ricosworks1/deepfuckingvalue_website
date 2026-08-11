# dfv.fun — website

The public website for DFV (Deep Fucking Value).

## What this is

A **single static HTML page**. No JavaScript, no database, no CMS, no build step,
no server-side code of any kind. The entire site is one file.

```
index.html    the whole site (logo + font embedded as data: URIs)
_headers      security headers applied by Cloudflare Pages
robots.txt
assets/       original source assets (not served)
```

## Why it is built this way

The previous dfv.fun ran on WordPress and was compromised in August 2026 — an
injected payload in the site-root `index.php` served cloaked spam to search
engines, alongside dozens of fraudulent admin accounts and intrusion plugins.

A static site removes that entire class of attack. There is no PHP to inject, no
plugins to patch, no admin panel to phish, and no database to read. The security
posture is enforced in `_headers`: `script-src` is absent from the policy
entirely, so **no JavaScript can execute on this origin at all**, even if a file
were somehow modified.

## Deploying

Hosted on Cloudflare Pages, deployed automatically from `main`.

- Build command: *(none)*
- Build output directory: `/`

Any push to `main` publishes. To roll back, revert the commit — Pages keeps every
previous deployment.

## Editing content

Open `index.html` and edit the text. It is plain HTML with a single `<style>`
block at the top; there is no framework to learn.

The logo and the Architects Daughter webfont are embedded as base64 `data:` URIs
so the page makes **zero external requests**. To replace either, re-encode and
swap the base64 string.

## Brand

Palette and marks follow `DFV_BasicoManualDeIdentidad` (Paula Alejandra Hurtado).

| Role | Hex |
|------|-----|
| Navy | `#223F84` |
| Crimson | `#E32C4D` |
| Pale blue | `#BAC5D7` |
| Off-white | `#F3F4F4` |

The brand manual specifies **Desyrel** as the display typeface. The font file was
not available at build time, so **Architects Daughter** is used instead — the same
face the previous WordPress site ran. Swap it if the licensed Desyrel file exists.

## Contracts

Smart contracts live in a separate repository:
<https://github.com/Ricosworks1/deepfuckingvalue_core>

| Contract | Address |
|----------|---------|
| DFVToken | `0x92513406F8AE28D83Dfeb401BCb0c9Df9b690f07` |
| DFVVesting | `0xdE3Cb3D571F575D3AfAA73b61A6041522eF02D0e` |
| DFVDAO | `0xFa85F00e72B4EfD4d02BB252CdAE23EeE8294508` |
| TimeLock | `0x43ACaFdA67E62a6248183830E03e6E4D3F823eDc` |

## License

MIT
