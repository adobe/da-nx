# Worklog

## 2026-03-21

### AGENTS.md creation
Created AGENTS.md to capture conventions not derivable from the code. Key entries:
- `undefined` vs empty array for loading state detection
- `somethingUrl` (URL object) vs `href` (string) naming convention
- Avoid attaching custom properties to `window` (built-in browser APIs are fine)
- Error return shape (`{ error }` vs `{ json }`)
- Lazy loading with `firstUpdated` + null check pattern
- IIFE memoization pattern
- Functional style with companion utils

### Nav/sidenav semantic markup
Decided to wrap nav and sidenav in semantic HTML elements:
- `<header>` wraps `<nx-nav>`
- `<nav>` wraps `<nx-sidenav>` — gives `navigation` landmark for free
- header and nav are siblings in the DOM
- Skipping `aria-label` on `<nav>` unless multiple nav landmarks are needed

## 2026-03-22

### AGENTS.md expanded
- Added Adobe Spectrum design language section — Nexter uses Spectrum *design* but not Spectrum libraries. Reference sites: express.adobe.com, experience.adobe.com.
- Added light/dark mode as a hard requirement with `light-dark()` CSS tip.
- Expanded lazy loading strategies: DOM-first hydrate-later, event-driven loading.
- Added iframe/customer code isolation convention (`setInterval` polling over `setTimeout`).
- Renamed "sidecar" utils to "companion" utils.

### CLAUDE.md & WORKLOG.md workflow
- Added `CLAUDE.md` instruction to read AGENTS.md for conventions.
- Added worklog trimming rule: delete git-recoverable info, condense completed work, keep open questions and key decisions.

### README.md updated
- Added "Context" section linking to AGENTS.md and WORKLOG.md with descriptions.

## 2026-04-03

### utils.js rewrite — multi-environment DA service config
- Replaced stub `DA_ORIGIN`/`daFetch` exports with real environment-aware origins for DA services (admin, collab, content, preview, etc.).
- `getEnv(key, envs)` resolves origin per service: checks query param → localStorage → default (stage for dev/stage, prod for prod).
- Removed `HashController` reactive controller; sidenav no longer uses it.
- `parseWindowPath` now returns `null` for missing/invalid hashes and strips trailing `/index` from hash.

### New api.js — extracted API layer
- `daFetch` handles auth token injection, checks URL against `ALLOWED_TOKEN` origins before attaching bearer.
- `ping`, `source`, `list`, `signout` — thin wrappers for DA/AEM endpoints.
- Profile block now imports `signout` from api.js instead of inlining the fetch.

### CSS: class selectors → meta-content selectors
- Spectrum Edge and app-frame layouts no longer rely on JS adding classes (`spectrum-edge`, `app-frame`).
- Replaced with `html:has(meta[content="edge-delivery"])` and `html:has(meta[content="app-frame"])` — pure CSS, no JS decoration needed.
- Removed `spectrum-edge` class addition from `decorateDoc` in nx.js.
- App-frame grid extracted to its own top-level rule block.

### profile.js — handleScheme simplification
- Color scheme toggle simplified: remove both classes, add the toggled one. No intermediate object.

### AGENTS.md — "parse, don't validate" convention
- Added to JS conventions section. Core idea: push validation to the boundary where data enters, return `null` or a well-formed result — no ambiguous middle ground. Downstream code trusts the shape without re-checking.
- Codifies the distinct meaning of `null` (absent), `undefined` (not yet loaded), and `''` (explicitly cleared).
- `parseWindowPath` is the canonical example: returns a clean `{ view, org, site, path }` or `null`.
