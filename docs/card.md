# Card

`nx-card` is a presentation-only card based on Browse's card layout. Import
`nx2/blocks/shared/card/card.js`; it loads its companion stylesheet.

| Slot | Content supplied by the application |
| --- | --- |
| `preview` | Preview link or thumbnail |
| `selection` | Optional selection control, top-left |
| `badge` | Optional persistent indicator, top-right |
| `title` | Title link, including an optional type icon |
| `actions` | Always-available action trigger |
| `metadata` | Dates or other secondary text |

The application owns links, permissions, preview fetching, file details and
favorite persistence. The component has no DA API or storage dependency and
does not make a whole interactive card into a nested link/button.

Cards fill their grid cells and use square previews by default.
Landing uses one compact layout by setting
`--nx-card-preview-height: 80px` and `--nx-card-preview-ratio: auto`.
These properties control thumbnail geometry, not the global S/M UI scale.
`--nx-card-background` can override the token-based surface for selection.

The frame uses 4px padding/gaps and a 12px radius. The title/action row and
metadata share a content area with 12px horizontal and 4px vertical padding.
An 80px preview, 20px action row and 18px metadata line produce Landing's
142px card. Spacing token 75 is 4px; token 100 is 8px and is reserved for
the preview's badge/selection inset.

Landing consumes the component on the paired `lp` preview branches. Browse
retains its existing implementation until this shared component is available
on its supported Nexter branches; an ordinary Browse visit must not start
depending on an unpublished shell module.

Consumers must give icon-only controls accessible names, retain keyboard focus
indicators, and truncate title text without hiding the action trigger.
