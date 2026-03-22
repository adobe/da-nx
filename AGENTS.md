# Nexter (da-nx)
Shell/framework for Adobe AEM Edge Delivery Services. Provides shared blocks, styles, scripts, and utilities consumed by sites like da.live.

## Decisions & rationale

- **Two block flavors exist intentionally:**
  - Plain JS blocks (fragment, card) — for simple DOM decoration, no shadow DOM needed.
  - Lit blocks (header, profile, sidenav) — for stateful, interactive components.
  - While the majority of blocks will be sateful web components, there are times where simple decoration is sufficient.

- **Dependencies are bundled by hand:**
  - Lit is built from a small `esbuild` wrapper in deps and is commited like all other source code.
  - This allows us to write vanilla and build-less JS against `lit` as if it was part of a build process.
  - You can rebuild the bundle with `npm run build:lit` if you need to rev the version.
  - Any non-critical Lit-based features like virtualizer should not be part of the build to keep the size and complexity low.

- **RGB color variables instead of hex:**
  - Enables use of CSS `light-dark()` function for theme switching and opacity changes.
  - Don't convert these to hex or oklch.

- **Lazy load everything possible**
  - If a block is non-critical, meaning it is post LCP, doesn't cause CLS, or not immediately visible, we prefer to load it lazily.
  - There are several strategies to handle this. You will often find modules dynamically loaded during Lit's firstUpdated phase, with null checks during use in case a module has not finished loading. This prevents chaining requests before the consuming web component can be used.

- **Memoization patterns**
  - For network calls that may be reused, you will find IIFEs that return functions. Examples can be seen in `utils/ims.js` and `utils/utils.js`.

## How this repo is consumed

- Like all other Edge Delivery projects, Nexter is designed to be evergreen and used directly rather than through an NPM package.
- Projects that use Nexter can have `?nx={name-of-branch}` appended to a page to see how a Nexter branch will impact it.

## Conventions not enforced by lint

- As a project purposefully avoiding TypeScript and build tools, be mindful of how variables and properties are named. If you see `somethingUrl`, this should be a proper URL object. If you see `href` this would imply a string that has all parts of a url: origin, pathname, search, hash, etc. but is not an actual URL object.
- Network calls often fail. Returns should have a consistent object structure so errors can be easily handled. You don't have to go overboard, a simple `{ error: 'The error messaage', status: resp.status }` for an error, and `{ json }` for success is fine. The consuming function can detect the error and decide what to do.
- Avoid attaching custom properties to `window`. Built-in browser APIs (`window.location`, `window.customElements`, etc.) are fine — the concern is using `window` as a global namespace for passing state between modules. The exception is external libraries (ProseMirror, CodeMirror, etc.) that require it.
- Avoid useless constructors in Web Components - Developers are encouraged to use `undefined` to help reason about the state of a web component. If a property is `undefined` it means it has not loaded yet. This makes checks in renders more concise: `${this._itemList ? this._renderItems() : nothing}` vs `${this._itemList?.length ? this._renderItems() : nothing}`. If you pre-populate an empty array in a constructor, you don't know if its empty because there are no items, or because the loader has not finished.
- Despite being heavily Web Component-based, this project prefers functional programming patterns: small and pure functions, immutability, use of let avoided, etc.
- The desire to be functional can often result in "sidecar" util files that live along some of the larger web components to help the web component stay purely focused on presentation, while a util will be focused on data manipulation. A good rule of thumb is that if it touches the DOM or reactive state, it stays in the component; if it transforms data, it goes in a util. Smaller web components (< 200 lines) are probably fine to stay as a single file.
- The desire to be functional must always be balanced with performance, developer ergonomics, and tesability.
