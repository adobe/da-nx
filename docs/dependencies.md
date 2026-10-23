# Shared dependencies

NX and NX2 shared components honor the consuming document's `da-lit` import-map
entry. Quick-edit also uses `da-y-wrapper` and `da-parser`. Map these names to the
application's selected bundles before importing NX modules:

```html
<script type="importmap">
{
  "imports": {
    "da-lit": "/deps/lit/dist/index.js",
    "da-y-wrapper": "/deps/da-y-wrapper/dist/index.js",
    "da-parser": "/deps/da-parser/dist/index.js"
  }
}
</script>
```

These URLs resolve against the consuming document, not the cross-origin NX
module. Shared components retain their upstream fallback for existing consumers
without an import map.

Quick-edit preview documents cannot inherit their controller's import map.
Quick-edit installs missing mappings before loading its editor modules, and maps
legacy `https://da.live/deps/...` imports to the same selected bundles so they
share module instances with bare imports.

For an independently hosted DA deployment, add
`da-origin=https%3A%2F%2Fauthor.example` to the preview URL. Quick-edit uses that
origin for unmapped dependencies, the link editor, and the portal iframe, and
preserves the parameter in standalone child previews. Explicit import-map entries
take precedence for dependencies. Without this parameter, quick-edit derives the
DA origin from `da-y-wrapper` when mapped, otherwise retaining `https://da.live`.
The standalone production and branch portal URLs remain unchanged unless
`da-origin` is supplied.
