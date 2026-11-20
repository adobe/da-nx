# Marketplace redesign ("Discover Capabilities")

Figma: https://www.figma.com/design/aliOqnaMYpvWLbnjrg5DFK/Experience-Workspace?node-id=5019-399234

## Intent

The marketplace gets a new UX. Rebuild `nx2/blocks/marketplace` to match the
"All Capabilities" part of the design. The Featured banners are out of scope.
Page title ("Discover Capabilities") and intro stay authored content, outside the block.

## Goals

- Toolbar row: "All Capabilities" heading, list/grid view toggle, "Sort by" control,
  search field ("Search N Capabilities", N = live item count).
- Left filter rail with a single "Type" group: "All Types" + one entry per distinct
  `Category` value from `marketplace.json` (derived from data, as today).
- List view (default): rows with icon, title, description, and actions on the right.
- Grid view: same content as cards.
- Actions: "View details" (opens `Doc Url`, new tab) on every item; "Try out"
  (opens `Try Url`, new tab) only when the row has one.
- Light and dark mode, responsive: rail stacks above the list on narrow containers.

## Non-goals

- Featured banners.
- "Installed" state and "Sort by: Installed".
- "Created by" filter (left out, as today; `Owner` is all Adobe).
- Details page/dialog — "View details" is today's "Learn more" link.

## Constraints

- Lit web component, constructed stylesheets, Spectrum 2 tokens from `nx2/styles`.
- Data transforms live in `marketplace-utils.js` as pure, tested functions.
- Reuse shared pieces: `nx-search` (`nx2/blocks/shared/search`), `buttons.css`.
- Keep existing loading skeleton / error / empty states and the no-layout-shift behaviour.

## Approaches

1. **Rework `nx-marketplace` in place (picked).** One component, utils extended with
   search + sort. Smallest change, matches current structure.
2. Split into sub-components (rail, toolbar, list). More files and events for a ~300-line UI.
3. Section-authored like `cards-filter`. Data already comes from a sheet; would duplicate content.

## Decided

- Type rail = `Category` column values, labelled "Type".
- View details = `Doc Url`; Try out = `Try Url`, only when present.
- Sort options (builder's call, proposed): Name (A–Z) and Newest (`Date` column).
- Search matches title + description, case-insensitive, combined with the Type filter.
- The current "⋯" actions menu is removed in favour of visible buttons.

## Left to the builder

- Exact spacing/typography from Figma dev mode, mapped to existing S2 tokens.
- View toggle and sort control implementation (reuse shared components where they fit).
- Whether view/sort/filter state is kept in memory only (proposed) or in the URL.
