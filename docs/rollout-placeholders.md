# Rollout placeholders

Rollout can replace `{{key}}` tokens in language-store (or source) content with values for each destination locale. For example, `Page title | Fedex {{country}}` becomes `Page title | Fedex Netherlands` at `/en-nl` and `Page title | Fedex Tonga` at `/en-to`.

Replacement only runs during rollout, and only on tokens already in the incoming content. Translation services, translation saves, sync and snapshot copies are not affected. If a translation step removes or expands a token, rollout cannot restore it. Translated language-store content should keep its tokens, for example `Paginatitel | Fedex {{country}}`.

## Configuration

This feature is opt-in. It only runs for sites that have a `/.da/rollout-placeholders.json` document. Without that document, rollouts work exactly as before and `{{key}}` tokens are copied unchanged.

Create a sheet at `/.da/rollout-placeholders.json` with one tab per destination locale. Each tab has `key` and `value` columns.

`nl-nl` tab:

| key | value |
| --- | --- |
| country | Nederland |
| countryCode | nl-nl |

`en-nl` tab: `country | Netherlands`. `en-to` tab: `country | Tonga`.

- Tab names are the rollout locale roots without the leading slash: `/nl-nl` uses `nl-nl` and `/eu/nl-nl` uses `eu/nl-nl`. A root (`/`) destination uses a tab named `/`. Matching is exact and there is no fallback to another locale or language.
- A destination without a tab keeps its tokens unchanged. Use this for intermediate stores in multi-step rollouts (for example global → `/eu` → `/en-nl`): leave out an `eu` tab so `/eu` keeps `{{country}}`, and add an `en-nl` tab so the final rollout fills it in.
- Keys are case-sensitive, must start with a letter, and may contain letters, digits, `_`, `.` and `-`. `{{country}}` and `{{ country }}` are equivalent.
- Values may only contain letters and digits in any script, spaces, and `. , ' -`, up to 100 characters. Empty values are allowed. A value with any other character, such as `< > " & : / = ? # %` or a line break, is an error for that locale. Values can't contain markup, URLs or placeholders, and replacement is never recursive.
- Duplicate keys within a tab, values outside the allowed characters, a missing `value`, non-text values and incomplete (paginated) tabs are errors for that locale only.

The configuration is read through the DA Source API at most once per rollout (see below for when). A missing document (404) turns the feature off. Any other read failure is reported as an error for documents that contain tokens.

## Where tokens are replaced

Tokens are replaced only in these places:

- **Text**, including metadata blocks (title, description and similar).
- **`alt` and `title` attributes.**
- **`href` and `src` links**, only after the start of the link, for example `/shipping/{{countryCode}}/index.html` or `?country={{countryCode}}`. Values used in a link may only contain `A-Z`, `a-z`, `0-9` and `-`, such as `nl-nl`. A token can't start a link, so a whole link (`href="{{supportUrl}}"`) or a host name can't come from a value. Write the link in the page and put only the locale-specific part in a token.
- **JSON sheets:** string cells in every tab, as text. Numbers, booleans, `null`, column names, row counts and `:` properties are kept as they are.

Tokens anywhere else are left unchanged, without an error. This includes other attributes (`aria-*`, `data-*`, `srcset`, `style`, `on*`), the content of `script`, `style`, `template`, `iframe` and similar elements, and the `da-metadata` system block. Tokens split by formatting (`{{<strong>country</strong>}}`) are reported as errors.

## Errors

The values a document needs are checked before it is written. If anything is missing or invalid, that destination is skipped. Nothing is written and no version is saved. Other destinations continue. Errors name the destination, the token or tab, and the location, for example:

`/org/site/nl-nl/page.html: missing value for {{country}} (text in <h1>)`

If the source page can't be read while the feature is on, that destination is also skipped with an error. After a rollout with errors, the language can be rolled out again, and the rolled-out counts include only successful destinations.

## Merge, overwrite and reruns

Tokens are replaced in a fresh copy of the upstream content before the existing merge or overwrite runs. The language store and existing destination content are not modified.

- **Merge:** the expanded upstream content is compared with the destination. A changed sheet value appears as a normal upstream change for regional review, and existing accepted or rejected changes still apply.
- **Overwrite:** the expanded content replaces the destination.
- **JSON:** sheets are always overwritten.
- **Reruns:** rolling out again with no changes to the source, the values or the destination does not create changes.

All rollout entry points support placeholders:

- Localization project rollout (`nx/blocks/loc/views/rollout`): the configuration is read only when a document contains tokens.
- Legacy project rollout (`nx/blocks/loc/project/views/rollout.js`) and the page rollout plugin (`nx/public/plugins/rollout`, `nx2/public/plugins/rollout`): the configuration is read once per rollout to check whether the feature is on. Source pages are only read ahead of the copy when it is on. The expanded page then goes through the existing copy helpers, so merge, overwrite and the merge-to-overwrite fallback all use it. Errors are listed on the language card (legacy) or shown as a red locale with a tooltip (plugin). Rollout from the root to the source language store is not a final locale, so tokens are kept there.

The implementation is in `nx/blocks/loc/utils/placeholders.js`.
