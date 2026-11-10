# Tools cards filter (`nx-cards-filter`) — design

## Intent
The Tools page needs the filter bar from Figma (Experience Workspace, node 4686:338687): category pills ("All" + one per section) and a "Search Tools" field. Categories show one section at a time; search hides cards that don't match, across all cards blocks on the page.

## Goals
- New block `nx2/blocks/cards-filter/` (authored as empty `nx-cards-filter` in the page's first section).
- Categories from the first heading (any level) of each section after the filter's section; each such section gets `id="category-<heading-id>"`.
- Category selected → only that section visible; "All" → all visible.
- Search → resets category to "All", searches every cards block; sections with no matches hidden; "No tools found" when nothing matches.

## Non-goals
- `site-apps` participation in search (later; it can join via the same events).
- URL/hash sync of the selected category.
- Restyling the shared `nx-segmented-btn` to match the Figma selected outline.

## Approaches
- **Chosen: event-based.** Filter dispatches `nx-cards-filter` on `document` with `detail: { query, results }`; each cards block filters its own cards and pushes `{ section, count }` into `results` synchronously. Filter hides sections afterwards. Keeps each block owning its own DOM; `site-apps` can join later.
- Rejected: filter queries `.nx-cards .card` directly (couples filter to cards' internal DOM).

## Decisions
- Reuse `nx-segmented-btn` (`nx2/blocks/shared/segmented-btn/segmented.js`, `size="m"`: 32px pills, 14px text, matching Figma) for pills and `nx-search variant="field"` (`nx2/blocks/shared/search/search.js`) for search, unchanged.
- Category value = section id (`category-…`); "All" value = `all`.
- Selecting a category clears the search (and re-shows all cards). Typing a query sets the category to "All".
- Matching: trimmed, case-insensitive substring of card title + description. Empty query = everything visible.
- During a search, sections that report 0 matches **or don't report** (e.g. "Your Apps"/`site-apps`) are hidden.
- Late-loading cards blocks dispatch `nx-cards-ready` on `document` after decorating; the filter re-sends the current query if non-empty.
- Labels via `loc`: "All", "Search Tools", "Filter tools by category", "No tools found".
- Sections hidden via the `hidden` attribute; pills scroll horizontally if they overflow.
- Managed sections = every `main > .section` after the filter's own section. Sections without a heading are not categories and are hidden whenever a category or a search is active.
