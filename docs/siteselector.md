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
| `getCreateSiteHref` | Optional `() => href` override; return `undefined` to hide Create. |

## Events

| Event | Purpose |
| ----- | ------- |
| `site-select` | Emits `{ value }` for the default selection, user selection or Add. Bubbles across shadow roots. |
| `site-add` | Dispatch this request to open Add, including when the selector is hidden. |

Listen before the selector connects to receive its initial selection:

```js
document.addEventListener('site-select', ({ detail: { value } }) => {
  console.log(value);
});
```

Create opens `/start` without an organization selection.
Override or hide it with `getCreateSiteHref` if the host uses a different destination.

Add parses an AEM site URL and remembers it in this browser, like the landing page.
It does not check access or whether the site exists.
