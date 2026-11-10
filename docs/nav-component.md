# Navigation branding

The EW `nx-nav` reads the brand link from the first section of its nav fragment.
By default, an SVG link renders as a lockup and other links keep their text.
The brand always links to `/`.

Consumers can pass `navBrand` to `setConfig()` to replace the fragment's lockup
with a separate logo and text:

```js
navBrand: {
  logoHref: '/img/logos/product.svg',
  label: 'Product name',
}
```

Both fields are required for the override. The consumer owns the asset and label;
Nexter owns their presentation. The existing nav fragment still supplies the
navigation items and actions. No content publication is required for the override.

The logo is 24×24 pixels, centered in a 32×32 pixel wrapper with a 12px left inset.
The label starts at 56px, flush with the right edge of the shell's navigation rail.
The label uses the S2 component M bold tokens (14px, weight 700, 18px line
height), with a 12px gap after the wrapper. Top-bar branding stays the same size
for both UI-size preferences. Text inherits the current theme's color, and the
decorative image has empty alternative text. The link's accessible name is the
label.

Only the logo is visible by default. Set `--nx-nav-brand-label-display: inline`
on `nx-nav` to show the label.

Deploy the Nexter capability before enabling it in a consuming application.
Older Nexter versions ignore `navBrand` and continue rendering the fragment's
original brand.
