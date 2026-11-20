# Marketplace teaser block

Figma: https://www.figma.com/design/aliOqnaMYpvWLbnjrg5DFK/Experience-Workspace?node-id=5019-401127 ("Featured / Banner Automation")

## Intent

Promote one featured app/extension at the top of the marketplace page. Authored on the
page (not from `marketplace.json`), so editors pick what to feature.

## Authoring (as on da.live/marketplace-copy)

```
| Teaser (violet)                                                       |
| <picture> | ### Block Inspector  (heading may be wrapped in <strong>) |
|           | Description paragraph                                     |
|           | [View details](https://…)                                 |
```

Rendered markup the block receives: `div.nx-teaser.violet > div > [div(picture), div(h3, p, p>a)]`.

## Goals

- Plain JS block `nx2/blocks/teaser` (no Lit, no shadow DOM), decorates in place.
- Full width, one teaser. Text left, picture right (Figma 5019:401127).
- Box: radius 16px, ~272px min-height desktop, 28px padding around text.
- Heading 28px bold / 35px line-height, `--s2-gray-800`; description 16px / 24px, `--s2-gray-700`.
- Last link in the content cell → dark pill button (Figma: `#292929` bg, white 14px bold,
  12px/7px padding, radius 16px) — same look as `.nx-btn-primary`, styled in `teaser.css`
  with tokens (`buttons.css` is not loaded on the document). Link text stays as authored.
- Picture fills the right column (~half width), `object-fit: cover`, anchored right/center.
- Background colour from block option: `pink`, `purple` (alias `violet`), `indigo`, `blue`,
  `seafoam`, `orange`, `gray` → `--s2-<colour>-100`. No/unknown option → `gray`
  (`--s2-gray-75`). Light/dark via the tokens' `light-dark()`.
- Below 600px container width: stack, text first, picture below at fixed height (~200px).
- Picture stays `loading="lazy"` (not LCP-critical).

## Non-goals

- Multiple teasers, compact teaser variant, 2:1 layouts.
- Dark-mode-specific illustration.
- Style-guide entry (page block, not a shared component).

## Approaches

1. **Plain JS decoration block (picked).** Matches AGENTS.md "plain JS for simple decoration"; no state.
2. Lit component — overkill for a static teaser.
3. Reuse `nx/blocks/card` — vertical image-on-top layout and blue CTA; would fight its CSS.

## Edge cases

- No picture → text only, full width.
- No link → no button.
- Heading wrapped in `<strong>` → rendered same as plain heading.
