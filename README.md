# Nexter
Next generation shell for Edge Delivery Services.

## About
Nexter provides a common set of styles, patterns, blocks, components, and libraries to accelerate building AEM Edge Delivery front-end applications. It's used heavily to build https://da.live.

## Run

### 1. Install NPM packages
```
npm install
```

### 2. Run Nexter locally
```
npm run local
```

### 3. Open Nexter consuming application
```
https://main--{NAME_OF_SITE}--{NAME_OF_ORG}.aem.live/apps/loc?nx=local
```
**Note:** `?nx=local` will tell the consuming application to load Nexter from your local environment.

## Navigation branding

Consumers can set a shared brand before calling `loadArea()`:

```js
await setConfig({
  brand: {
    title: 'Example Product',
    logoHref: '/img/brand.svg',
    logoSize: 24,
  },
});
```

Both NX1 and NX2 `nx-nav` render this logo and title on pages using that configuration,
independently of page components. `logoHref` is an image URL string and
`logoSize` is the square image size in pixels (default 24). The title uses the
shared font at 14px/700/18px; below 600px the title is visually hidden while the
logo and accessible link label remain. The link uses the optional `homeHref`
configuration or the existing Home default.

Omitting `brand` preserves the original navigation-fragment lockup and styling.
The NX2 optional `brand` slot remains available for consumer-owned custom content.
