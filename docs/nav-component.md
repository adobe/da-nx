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
