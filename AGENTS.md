# Nexter (da-nx)
A shell/framework for Adobe AEM Edge Delivery Services. Provides shared blocks, styles, scripts, and utilities consumed by Adobe sites like da.live.

## Decisions & rationale

- **Lazy load everything possible**
  - If a block is non-critical, meaning it is post LCP, doesn't cause CLS, or not immediately visible, we prefer to load it lazily.
  - There are several strategies to handle this. You will often find modules dynamically loaded during Lit's firstUpdated phase, with null checks during use in case a module has not finished loading. This prevents chaining requests before the consuming web component can be used.
  - Another strategy is to add a custom element into DOM, but only hydrate it as a Web Component when necessary. This can prevent awkwardly trying to add an element while also trying to lazily load a module.
  - You can also use events to trigger lazy loading. When a task is completed, an event can be fired that other functions can pick up and load modules, data, icons, etc. as necessary.

- **Memoization, IIFE, and side-effect patterns**
  - For network calls that may be reused, you will find IIFEs that return functions. Examples can be seen in `utils/ims.js` and `utils/utils.js`.
  - This pattern is important as many components may try to request a resource while a sibling request is not finished. Memoizing these requests truly prevents the browser from making parallel calls and helps with debugging performance issues.
  - Use side-effects where appropriate. Due to how state can change, side-effects can be another helpful tool to ensure code only runs once.

- **Two block flavors exist intentionally:**
  - Plain JS blocks (fragment, card) — for simple DOM decoration, no shadow DOM needed.
  - Lit blocks (nav, profile, sidenav) — for stateful, interactive components.
  - While the majority of blocks will be sateful web components, there are times where simple decoration is sufficient.

- **Dependencies are bundled by hand:**
  - Lit is built from a small `esbuild` wrapper in deps and is commited like all other source code.
  - This allows us to write vanilla and build-less JS against `lit` as if it was part of a build process.
  - You can rebuild the bundle with `npm run build:lit` if you need to rev the version.
  - Any non-critical Lit-based features like virtualizer should not be part of the build to keep the size and complexity low.

- **Adobe Spectrum & Nexter's design language**
  - Nexter applications use Adobe Spectrum _design_ wherever possible. This is not to be confused with React Spectrum or Spectrum Web Component libraries. Due to the performance and developer experience requirements of Nexter applications, it is not feasible to use off the shelf Adobe Spectrum code directly.
  - Nexter takes a "best effort" approach to re-create Spectrum design while balancing user experience, code maintainability, and native browser APIs. A useful example: The Spectrum date picker has a truly wonderful user experience for its popover. However, styling the existing `<input type="datetime-local" />` to match is not 1:1 as certain parts of the popover cannot be styled.
  - Nexter's design language can best be described, "What if Adobe Express and AEM had a baby?" This is understandabily subjective, but PRs with user experiences that do not feel at home with either products will have changes requested. When in doubt, visit express.adobe.com or experience.adobe.com and ask yourself, "Would this fit in here?" If the answer is no, adjust accordingly or reach out to the team for guidance.
  - Use the variables provided in styles.css, existing blocks, or even `public/sl/..` to inform how styles and user experiences should be built.
  - Nexter supports light & dark modes natively. All features must support light and dark mode. Helpful tip: `light-dark()` in CSS will do the bulk of the heavy lifting.

## How this repo is consumed

- Like all other Edge Delivery projects, Nexter is designed to be evergreen and imported via HTTPS rather than through an NPM package.
- Consuming directly prevents NPM package dependency maintenance, but requires care to ensure no breaking changes are introduced.
- Within Nexter itself, avoid using a consuming project (DA) as a dependency. If something is needed, pull it into Nexter as a common feature.
- There are two primary ways Nexter is used:

- **Direct consumption:**
  - Projects internal to Adobe are welcome to use Nexter as a foundation for their project if they find it provides value. Nexter can provide IMS, a shell, styles, and many common utilites useful for maintaining AEM & Edge Delivery projects.
  - All work should be done in the root `/nx` folder as this is the path that is mapped at the CDN. Anything outside will be invisible in production. Tests and tools are fine to stay outside.
  - Projects that use Nexter can have `?nx={name-of-branch}` appended to an experience to see how a Nexter branch will impact it.

- **Using Nexter's public SDK:**
  - Anything in `/nx/public` is considered part of the public SDK. Partners, customers, and even Adobe are encouraged to use these functions if they provide value.
  - Functions and styles in the public SDK cannot be broken in any way, they must always maintain backwards compatibility or provide an in-place upgrade of existing functionality.
  - Any commits to `/nx/public` must be intentional as they may be used in the wild.

## JavaScript conventions not enforced by lint

- As a project purposefully avoiding TypeScript and build tools, be mindful of how variables and properties are named. If you see `somethingUrl`, this should be a proper URL object. If you see `href` this would imply a string that has all parts of a url: origin, pathname, search, hash, etc. but is not an actual URL object.
- If something is not required to get to LCP, it should not live in `scripts.js` or `nx.js`.
- Network calls often fail. Returns should have a consistent object structure so errors can be easily handled. You don't have to go overboard, a simple `{ error: 'The error messaage', status: resp.status }` for an error, and `{ json }` for success is fine. The consuming function can detect the error and decide what to do.
- Avoid attaching custom properties to `window`. Built-in browser APIs (`window.location`, `window.customElements`, etc.) are fine — the concern is using `window` as a global namespace for passing state between modules. The exception is external libraries (ProseMirror, CodeMirror, etc.) that require it.
- Avoid useless constructors in Web Components - Developers are encouraged to use `undefined` to help reason about the state of a web component. If a property is `undefined` it means it has not loaded yet. If you pre-populate an empty array in a constructor, you don't know if its empty because there are no items, or because the loader has not finished. This also makes checks in renders more concise: `${this._itemList ? this._renderItems() : nothing}` vs `${this._itemList?.length ? this._renderItems() : nothing}`.
- Despite being heavily Web Component-based, this project prefers functional programming patterns: small and pure functions, immutability, use of let avoided, etc.
- You may find "companion" util files that live along some of the larger web components to help the web component stay purely focused on presentation, while a companion util will be focused on data manipulation. A good rule of thumb is that if it touches the DOM or reactive state, it stays in the component; if it transforms data, it goes in a util. Smaller web components (< 300 lines) are probably fine to stay as a single file as long as testability is not compromised.
- The desire to be functional must always be balanced with performance, developer ergonomics, and tesability.
- Exported functions should prefer destructured object parameters over positional parameters for functions with two or more arguments. With destructured parameters: `getFullName({ firstName, lastName })`, functions can grow over time without a developer being concerned about ordering or setting defaults as the last parameters.
- Iframes and customer code isolation is a critical part of Nexter. Using setInterval with a reasonable delay (100ms) and timeout (3s) while waiting for the other side to respond `ready` is preferred over a one-time `setTimeout`.

## Consumer page lifecycle

- **head.html**
  - loads `scripts.js`.

- **scripts.js**
  - Determines what branch of nexter to load: production, branch, or local.
  - Loads appropriate styles.
  - Imports `nx.js`.
  - Setups up base config object (locales, ims scopes, etc.)
  - Runs `loadPage` which will `setConfig` and `loadArea` from `nx.js`.

- **nx.js**
  - `loadArea` decorates the page and determines what should be loaded and when.
  - If a document, `nav` and `sidenav` will be scaffolded out for post LCP loading.
  - If a returning session, `nav`, `sidenav` and fonts will be fast-tracked.
  - If a language other than default, localized strings will be loaded.
  - Each section of the area will be syncronously loaded.
  - Link blocks (i.e. fragments) will be hydrated first, table-based blocks will be second.
  - If direclty after `section[0]` and no previous session, LCP concerns will be loaded.

- **blocks/example/example.js (web component)**
  - Will import `scripts/nx.js` which will have the config object (env, logging, localized strings, etc).
  - Will import `utils/ims.js` which will have current identity information.
  - Will import `utils/utils.js` which will have hash path details and other common functions.
  - Will import `blocks/example/example.css` as a constructed stylesheet.
  - May statically import `blocks/aem-path/aem-path.js` if required for first render.
  - May dynamically import `blocks/sub-example/sub-example.js` lazily in `firstUpdated`.
