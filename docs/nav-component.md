# Navigation branding

`nx-nav` reads the logo URL and title from the first link in its nav fragment's
first section:

```html
<div>
  <p><a href="/img/logos/product.svg">Product name</a></p>
</div>
```

The SVG is rendered directly; no filename or shape conventions apply. The brand
links to `/`, with the title as its accessible name even when hidden. Linked
images and pictures are also supported, using image alt text if link text is absent.

The logo is 24x24px in a 32x32px wrapper. The title uses S2 14px bold typography.

## Title visibility

- Empty left navigation area: show the logo and title.
- Non-empty left navigation area: show only the logo.

This uses CSS `:empty`; breadcrumb placeholders are omitted until a route is
available. Other mounted navigation components count as content.
Override with
`--nx-nav-brand-label-display: inline` or `none` on `nx-nav` for page-specific
layouts or sidenav expansion.

## Compatibility

The existing `navBrand: { logoHref, label }` config override remains supported;
both fields are required. Prefer content-owned branding.

Deploy Nexter and publish the updated nav content before removing the override.
Check legacy UI rendering if it shares the fragment.
