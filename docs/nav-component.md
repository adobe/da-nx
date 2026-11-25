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

Only the logo is visible by default, and breadcrumbs start at 56px. Set
`--nx-nav-brand-label-display: inline` on `nx-nav` to show the label.

Deploy the Nexter capability before enabling it in a consuming application.
Older Nexter versions ignore `navBrand` and continue rendering the fragment's
original brand.

## Help and feedback menu

The `help-and-feedback` nav action renders the `nx-help-and-feedback` lightbulb
menu. Its items come entirely
from `/fragments/nav/help-and-feedback` on the consuming app's origin. JavaScript does not
insert menu entries: authors control their presence, order, labels, links, icons
and descriptions.

The lightbulb trigger stays hidden while loading and when the fragment is
missing, fails to load, or contains no usable menu items.

Author each item as a linked paragraph, optionally with an icon span inside the
link and an emphasized description after it. Separate groups with sections or
horizontal rules. For example, the fragment's main content can contain:

```html
<div>
  <p><a href="#whatsnew"><span class="icon icon-gift"></span>Explore what's new</a></p>
</div>
<div>
  <p><a href="#idea"><span class="icon icon-lightbulb"></span>Submit an idea</a><br>
    <em>Suggestions and feature requests</em></p>
  <p><a href="#bug"><span class="icon icon-bug"></span>Report a bug</a><br>
    <em>Problems using AEM</em></p>
  <p><a href="https://discord.gg/aem-live"><span class="icon icon-discord"></span>Join our Discord Server</a><br>
    <em>Discussion forum</em></p>
</div>
<div>
  <p><a href="https://www.aem.live/docs/ew/about">Resources</a></p>
  <p><a href="#legal">Legal notices</a></p>
</div>
```

Same-origin `#idea` and `#bug` open the existing feedback dialogs. `#whatsnew`
opens the existing What's new dialog with its unseen-content indicator, and
`#legal` opens the shared Legal notices modal. Links to
`/fragments/guides/whats-new` and `/fragments/nav/help` also open those modals.
Other links open in a new tab; external links are never interpreted as modal
actions, even when they contain one of these hashes.
