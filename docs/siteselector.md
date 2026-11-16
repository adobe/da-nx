# nx-siteselector

Add `siteselector` to a navigation fragment's site-nav list.
It selects the most recent site by default. Consumers own navigation and access checks;
set `value` to supply a selection instead. It is hidden when no sites are available.

## Properties

| Property | Purpose |
| -------- | ------- |
| `heading` | Unselected trigger and section label; defaults to `Your recent sites`. |
| `size` | `s` (default) or `m`. |
| `value` | Selected `org/site`. Set before connection to override the default. Later changes do not emit `site-select`; clear with `''`. |
| `getCreateSiteHref` | Optional `() => href` override for Add site; return `undefined` to skip navigation. |

## Events

| Event | Purpose |
| ----- | ------- |
| `site-select` | Emits `{ value }` for the default selection or user selection. Bubbles across shadow roots. |
| `site-add` | Dispatch this request to navigate to `/start`, including when the selector is hidden. |

Listen before the selector connects to receive its initial selection:

```js
document.addEventListener('site-select', ({ detail: { value } }) => {
  console.log(value);
});
```

Add site navigates directly to `/start` without a dialog or an organization selection.
It preserves preview settings while removing `org`, `site`, `browse`, and the hash.
Override the destination with `getCreateSiteHref` if the host uses a different route.
