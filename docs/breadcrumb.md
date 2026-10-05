# nx-breadcrumb

Renders a breadcrumb trail from a list of path segments. The last segment is shown as
the current page (plain text); earlier segments are links back to that point in the path.

## Usage

```html
<nx-breadcrumb></nx-breadcrumb>
```

```js
import "/path/to/breadcrumb/breadcrumb.js";

const breadcrumb = document.querySelector("nx-breadcrumb");
breadcrumb.pathSegments = ["myorg", "mysite", "docs", "style-guide"];
```

Renders nothing if `pathSegments` is empty or unset.

### Building segments from route state

If you already have `{ org, site, path }` state (e.g. from a hash-based route),
`hashStateToPathSegments` builds the `pathSegments` array for you:

```js
import { hashStateToPathSegments } from "/path/to/breadcrumb/utils.js";

breadcrumb.pathSegments = hashStateToPathSegments({
  org: "myorg",
  site: "mysite",
  path: "docs/style-guide",
});
// ['myorg', 'mysite', 'docs', 'style-guide']
```

Returns `undefined` if `org` or `site` is missing.

## API

### Properties

| Property       | Type     | Description                                                                                  |
| -------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `pathSegments` | `Array`  | Ordered list of path segment labels. The last one renders as the current page.                |
| `baseUrl`      | `String` | Optional base URL each link resolves against. Omit for hash-only links (`#/segment/segment`). The current page's query string is preserved on generated links. |
