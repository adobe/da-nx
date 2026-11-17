# Inline do-not-translate rules

JSON spreadsheets can contain variables such as `{name}` or `{{count}}` inside translatable UI strings. Inline DNT rules preserve those variables while leaving the surrounding text available for translation. They apply to JSON spreadsheets, not HTML document blocks.

## Configuration

In the `dnt-sheet-rules` tab of `.da/translate`, use `between(open, close)` with the `dnt-inline` action:

| pattern | action |
| --- | --- |
| `between({, })` | `dnt-inline` |
| `between([, ])` | `dnt-inline` |
| `between(%%, %%)` | `dnt-inline` |

For example, the brace rule protects `{inventory}` and `{count}` in `Only {inventory} of {count} in stock` without excluding the whole sentence from translation.

## Behavior

- Delimiters are literal and case-sensitive, not regular expressions. Each rule protects every complete pair, including the delimiters.
- Distinct opening and closing delimiters are balanced, so the brace rule protects both `{name}` and `{{name}}`. Identical delimiters such as `%%` are paired sequentially.
- Unmatched or multiline pairs remain untouched, but complete pairs inside an unmatched opener are still protected. For example, `Use { to start a token; {count} items remain` protects only `{count}`.
- Overlapping matches use the leftmost match, preferring the longest match at the same position.
- Matches must fit within a single text segment. Existing pipe-separated cells are processed segment by segment.
- Whole-sheet, row, column, and whole-cell DNT exclusions take precedence. Existing `dnt` rules keep their whole-cell behavior.

## Errors

`dnt-inline` requires `between(open, close)`. Delimiters cannot be empty, contain commas or line breaks, or be prefixes of each other unless identical. Whitespace around the two configured delimiters is ignored.

Malformed inline rules stop JSON spreadsheet preparation with an error rather than sending unprotected content for translation. HTML document translation ignores these spreadsheet-only rules.

The implementation is in `nx/blocks/loc/dnt/inlineDnt.js`. The standard and GLaaS configuration parsers retain inline rules, and the shared JSON converter validates and applies them.
