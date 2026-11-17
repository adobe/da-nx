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
- Unmatched or multiline pairs remain untouched.
- Overlapping matches use the leftmost match, preferring the longest match at the same position.
- Matches must fit within a single text segment. Existing pipe-separated cells are processed segment by segment.
- Whole-sheet, row, column, and whole-cell DNT exclusions take precedence. Existing `dnt` rules keep their whole-cell behavior.

## Errors

`dnt-inline` requires `between(open, close)`. Delimiters cannot be empty, contain commas or line breaks, or be prefixes of each other unless identical. Whitespace around the two configured delimiters is ignored.

Malformed inline rules stop preparation with an error rather than sending unprotected content for translation.

The implementation is in `nx/blocks/loc/dnt/inlineDnt.js`, used by the shared JSON converter and the standard and GLaaS DNT configuration parsers.
