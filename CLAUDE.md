# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nexter is a next-generation shell for Edge Delivery Services that provides a common set of styles, patterns, blocks, components, and libraries to accelerate building AEM Edge Delivery front-end applications. It's heavily used to build https://da.live.

Nexter is consumed by other applications by appending `?nx=local` to the URL when running locally, which tells the consuming application to load Nexter from your local environment at `http://localhost:6456`.

## Development Commands

### Local Development
```bash
npm run local                 # Start local dev server on port 6456
```

### Testing
```bash
npm test                      # Run all tests with coverage
npm run test:watch            # Run tests in watch mode
npm run test:debug            # Run tests in debug mode with watch
npm run test:file             # Run a single test file: npm run test:file -- path/to/test.test.js
npm run test:file:watch       # Run single test file in watch mode
```

### Linting
```bash
npm run lint                  # Lint both JavaScript and CSS
npm run lint:js               # Lint JavaScript only
npm run lint:css              # Lint CSS only
npm run lint:css:fix          # Auto-fix CSS linting issues
```

### Building Dependencies
```bash
npm run build:mdast           # Build bundled mdast dependencies
npm run build:codemirror      # Build bundled CodeMirror dependencies
npm run build:da-lit          # Build bundled Lit dependencies
npm run build:da-form         # Build bundled da-form dependencies
```

## Architecture

### Directory Structure

- **`nx/`** - Main Nexter codebase
  - **`blocks/`** - Reusable UI blocks (modal, toast, sidenav, loc, shell, etc.)
  - **`utils/`** - Utility functions (daFetch, ims, script, styles, converters, etc.)
  - **`scripts/`** - Core scripts (nexter.js, lazy.js, postlcp.js)
  - **`styles/`** - Global stylesheets
  - **`deps/`** - Bundled dependencies (mdast, codemirror, lit, da-form)
  - **`public/`** - Public assets and utilities
  - **`sdk/`** - SDK demo files
- **`test/`** - Test files mirroring the nx/ structure
- **`deps/`** - Root-level bundled dependencies (lit)
- **`tools/`** - Development tools (wtr reporters, etc.)

### Block Pattern

Blocks are the core component pattern. Each block lives in its own directory with:
- `blockname.js` - JavaScript implementation exporting a default function
- `blockname.css` - Block-specific styles (optional, not loaded for `.cmp` blocks)

Blocks can be prefixed with `nx-` to load from Nexter's blocks directory, or unprefixed to load from the consuming application's blocks directory.

Example block structure:
```javascript
// nx/blocks/toast/toast.js
export default async function init(element) {
  // Block initialization logic
}
```

### Key Architectural Patterns

1. **Config Management**: Use `setConfig()` and `getConfig()` from `nx/scripts/nexter.js` to manage app configuration
2. **Block Loading**: Blocks are loaded dynamically via `loadBlock()` which handles both nx- prefixed and app-specific blocks
3. **Shell/IFrame Communication**: The shell block manages iframe-based content loading via MessageChannel
4. **Content Source**: Content is fetched from `https://content.da.live` as defined in `fstab.yaml`
5. **Module Format**: All code uses ESM (ES modules)

### Dependencies

- **Bundled Dependencies**: Large dependencies are bundled via esbuild to reduce load on consuming applications
  - mdast utilities for markdown processing
  - CodeMirror for code editing
  - Lit for web components
  - da-form for form handling
- **Testing**: Web Test Runner with Chai assertions and Sinon for mocking
- **Linting**: ESLint with Adobe Helix config, Stylelint for CSS

### Test Patterns

Tests use Web Test Runner and should:
- Use `@esm-bundle/chai` for assertions
- Mock external requests (fetch/XHR to external URLs are blocked in tests)
- Place test files in `test/` directory mirroring the source structure
- Use `.test.js` suffix for test files
- Use the custom diff reporter for visual regression testing

Example test structure:
```javascript
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('Feature name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something', () => {
    expect(actual).to.equal(expected);
  });
});
```

## Important Files

- **`fstab.yaml`** - Defines content mountpoints (points to content.da.live)
- **`eslint.config.js`** - ESLint configuration with ignored files
- **`.stylelintrc.json`** - Stylelint configuration
- **`web-test-runner.config.mjs`** - Test runner configuration with import maps and external request blocking
- **`nx/scripts/nexter.js`** - Core Nexter script that handles block loading and configuration

## ESLint Configuration Notes

The following files/patterns are excluded from linting:
- `**/deps` - Bundled dependencies
- `**/nx/blocks/loc/regional-diff/object_hash.js` - Third-party code
- `**/nx/blocks/loc/views/complete/confetti.js` - Third-party code
- `**/nx/blocks/loc/connectors/sample/index.js` - Sample code

## Testing Notes

- External fetch/XHR requests are blocked in tests - mock all external calls
- External scripts are blocked in tests via MutationObserver
- Tests run with retry on CI (GitHub Actions) but not locally
- Coverage includes `nx/**` and `scripts/**` but excludes `deps/`, `mocks/`, and `test/`
- Use `npm run test:file:watch` to develop tests interactively in a browser
