---
name: ew-color-contrast
description: Use when reviewing text/background color pairs in an Experience Workspace (EW) extension's CSS for WCAG AA contrast compliance, and when a raw hex value needs replacing with the correct real Adobe Spectrum token instead of an invented one.
---

# EW Color Contrast

Two separable checks, run in this order:

1. **WCAG contrast** — fully computable from whatever hex is already in
   the file, no Spectrum data needed. Compute real ratios, never eyeball.
2. **Token correctness** — if a fix requires a *specific* Spectrum step
   (e.g. "use gray-600"), get the real hex from the actual
   `@adobe/spectrum-tokens` package. Never invent a plausible-looking hex
   and call it a token — that's worse than leaving raw hex, because it
   looks authoritative and isn't.

## Step 1 — compute contrast, don't guess

For every text/background color pair in scope, compute the WCAG 2.x
contrast ratio (standard relative-luminance formula). Thresholds:
- **4.5:1** — normal text (anything not covered by the large-text rule below)
- **3:1** — large text only: ≥18px regular weight, or ≥14px (≈10.5pt) bold

Most UI labels (11-13px) are normal, not large — don't apply the 3:1
bar to small caps labels just because they're bold; boldness alone
doesn't qualify unless the size threshold is also met.

```python
def lin(c):
    c = c/255
    return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
def lum(hex_color):
    h = hex_color.lstrip('#')
    r,g,b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
    return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)
def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la,lb), min(la,lb)
    return (hi + 0.05) / (lo + 0.05)
```

Run this for every distinct text-color/background-color pair actually
rendered together — including pairs that only exist through inherited
background (e.g. a pill's `background: transparent` sitting on its
parent card's real background color, not on "nothing").

## Step 2 — if a fix needs a specific token, fetch the real value

Don't guess a token name + hex pair that "looks about right." Get the
real value from the public `@adobe/spectrum-tokens` npm package —
no local install needed:

```bash
curl -sL "https://unpkg.com/@adobe/spectrum-tokens/src/color-palette.json" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['gray-600']['sets']['light']['value'])"
```

Also check whether the file already has a `var(--s2-*, #fallback)` for
that exact step elsewhere — if the existing fallback doesn't match what
the real package says today, the file has drifted from a package
version bump; worth fixing the fallback too while you're in that line,
not just the failing rule.

## Real worked example (Nerve Center, 2026-08-26)

Computed against `nerve-center.css`'s actual color pairs:

| Pair | Ratio | AA (4.5) | Note |
|---|---|---|---|
| `.obs-detail-label` (11px) `#888780` on white | 3.61 | **FAIL** | small text, needs 4.5 |
| `.nc-count` (12px) `#888780` on `#f9f9f7` | 3.42 | **FAIL** | same color, different bg, still fails |
| everything else checked (pills, body text, source link) | 3.42–14.55 | PASS | no action needed |

Fix: needed a real `gray-600` value, not a guess. This file's *own*
existing fallback (`.obs-description` used elsewhere: `var(--s2-gray-600,
#767676)`) turned out to be stale — the real current package value is
`rgb(113,113,113)` = `#717171`, which clears both backgrounds (4.88 and
4.63). Applied `color: var(--s2-gray-600, #717171)` to both failing
rules — real token, verified ratio, not the file's own slightly-outdated
fallback either.

## A FAIL can be knowingly overridden — document it when it is

Not every reported FAIL gets fixed. A product/design call can override
a real contrast fail on purpose (readability traded for a stated visual
goal). That's a legitimate outcome — but it must be written down as a
deliberate override, not left silent, or the next person (or the next
run of this skill) will think the check simply missed it. Real NC
example: `tier-low`'s white text on `#fc7d00` measures **2.6**, well
under the 4.5 bar — kept anyway on explicit request, with the real
number left in a code comment rather than hidden. The skill's job is to
report the true number; overriding it is the requester's call, not this
skill's to make quietly.

## Do NOT

- Do not apply the 3:1 "large text" threshold to small/normal text just
  because it's bold — check actual px size against the real rule first.
- Do not invent a hex value and label it a token name — fetch the real
  value or leave the raw hex with an honest note that it's unverified.
- Do not stop at "this pair passes" without checking every distinct
  pair actually rendered together, including inherited backgrounds.
