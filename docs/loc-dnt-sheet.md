# Do-not-translate sheet rules

The `dnt` tab of `.da/translate.json` marks tabs and columns of JSON sheets as do-not-translate. Each row has a `dnt-sheet` and a `dnt-columns` cell.

## `dnt-sheet` values

| Value | Applies to |
|---|---|
| `*` | Every tab of every sheet |
| `tab` | The tab with that name, in every sheet |
| `/path:tab` | The tab with that name, in the sheet at `/path` only |
| `/path` | Every tab of the sheet at `/path` |

- `dnt-columns` is a comma-separated list of column names, or `*` for the whole tab.
- A `/` prefix marks a document rule. Split at the last `:`.
- Paths are language-agnostic and site-relative, so `/products/prices` covers `/en/products/prices` and `/fr/products/prices`. The `.json` extension is optional.
- `*` in a path matches any characters, so `/products/*:data` covers every sheet under `/products/`.
- Path rules need the document path. Connectors that don't pass it (GLaaS ignores the `dnt` tab) skip them.

## Single-tab sheets

DA saves a single-tab sheet with its tab name in `:sheetname` (new sheets default to `data`). Rules match that name, so `/path:data` works on a sheet that has one `data` tab. Files without `:sheetname` are treated as `data`. A rule for `default` also still matches any single-tab sheet.

Prefer `/path:data` over a bare `data` rule when only some sheets should be protected, because a bare tab name applies to every sheet.

## System columns

`:translate`, `:rollout`, `:uid` and `:regional` are never translated, in every tab of every sheet, whether or not any `dnt` rules exist. A row with `:translate` set to `no` is skipped entirely.
