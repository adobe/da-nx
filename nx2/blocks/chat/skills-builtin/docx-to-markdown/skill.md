---
name: docx-to-markdown
description: Convert an attached .docx file to markdown text.
version: 1
execution_entry: convert
execution_runtimes: js
execution_capabilities:
execution_timeout_ms: 5000
---

## docx-to-markdown

Converts a `.docx` file (supplied as base64-encoded bytes) to plain Markdown text.
The conversion runs fully client-side in a sandboxed Web Worker — no bytes leave the
browser.

### Input

```json
{ "bytesBase64": "<base64-encoded .docx bytes>" }
```

### Output

```json
{ "markdown": "<extracted markdown text>" }
```

On failure the script returns `{ "error": "<message>" }` instead of `{ "markdown" }`.

### Notes

- Extracts text from `word/document.xml`, headers, and footers inside the .docx ZIP.
- XML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) are unescaped.
- Does not preserve rich formatting (bold, italic, tables) — plain text only in this version.
- `execution_capabilities` is empty, meaning this skill is client-eligible and runs
  without any network, storage, secrets, or PII access.
