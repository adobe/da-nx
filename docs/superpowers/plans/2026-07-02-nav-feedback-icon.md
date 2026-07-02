# Nav Feedback Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Feedback icon button to the nx2 main nav action area (next to profile) that opens a menu with "Submit an idea", "Report a bug" (each opening a stub dialog), and "Join our Discord Server" (external link).

**Architecture:** The nav fragment's Feedback link (`/fragments/nav/feedback#feedback`) is auto-converted into a `nx-feedback` block by the existing `linkBlocks`/`loadBlock` mechanism in `nx2/scripts/nx.js`. `nx2/blocks/feedback/feedback.js` turns that link into a button (mirroring `blocks/dialog/dialog.js`), wraps it in a new `<nx-feedback-menu>` Lit element that lazily fetches `/fragments/nav/feedback`, parses it into menu items, and renders them via the existing shared `<nx-menu>` component (extended with an optional description line) and shared `<nx-dialog>` component for the stub dialogs.

**Tech Stack:** Lit (`da-lit`), vanilla JS auto-blocks, existing shared components (`nx-menu`, `nx-popover`, `nx-dialog`, `sl-button`), `@web/test-runner` + `@esm-bundle/chai` + `sinon` for tests.

## Global Constraints

- Icon SVG assets (`S2_Icon_Feedback_20_N.svg` and `s2-icon-idea-20-n.svg` / `s2-icon-bug-20-n.svg` / `s2-icon-discord-20-n.svg`) are **out of scope** — added separately by the requester. Do not create placeholder SVGs.
- No feedback-submission network call in this iteration — the dialog "Submit" button is a stub that just closes the dialog (`// TODO: POST to feedback endpoint in a follow-up`).
- Do not modify `nx2/blocks/dialog/dialog.js` or fix the Help button's missing click wiring — explicitly out of scope (confirmed with requester).
- Follow existing conventions exactly: `nx-menu` items use lowercase icon names matching `s2-icon-<name>-20-n.svg` (see `nx2/blocks/chat/constants.js`); the trigger button icon uses the `span.icon.icon-<Name>` convention (see `nx2/blocks/nav/nav.js` / Help button) — these are two independent, already-established naming schemes; do not unify them.
- Run tests with `npm run nx2:test:file -- --group <path>` or the full `npm run nx2:test` before each commit that touches nx2 code (pre-commit hook runs the whole suite regardless).

---

## File Structure

- `nx2/blocks/shared/menu/menu.js` — **modify**: add optional `item.description` rendering.
- `nx2/blocks/shared/menu/menu.css` — **modify**: styles for the new description line.
- `nx2/test/unit/nx/blocks/shared/menu/menu.test.js` — **create**: tests for the description feature.
- `nx2/scripts/scripts.js` — **modify**: add `{ 'nx-feedback': '/fragments/nav/feedback' }` to `linkBlocks`.
- `nx2/blocks/feedback/feedback.js` — **create**: `parseFeedbackItems` (pure helper), `NxFeedbackMenu` (Lit component), `init(a)` (default export, auto-block entry point).
- `nx2/blocks/feedback/feedback.css` — **create**: host display + dialog textarea styling.
- `nx2/test/unit/nx/blocks/feedback/feedback.test.js` — **create**: tests for `parseFeedbackItems`, `init(a)`, and `NxFeedbackMenu` select/dialog behavior.
- `nx2/blocks/nav/nav.css` — **modify**: add `.feedback` icon-only button rule alongside existing `.dialog` / `.profile` rules.
- `nx2/test/unit/nx/blocks/shared/custom-element-guard.test.js` — **modify**: add `nx-feedback-menu` to the guarded-components list.

---

## Task 1: Extend shared `nx-menu` with an optional description line

**Files:**
- Modify: `nx2/blocks/shared/menu/menu.js`
- Modify: `nx2/blocks/shared/menu/menu.css`
- Test: `nx2/test/unit/nx/blocks/shared/menu/menu.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `nx-menu` items may now include an optional `description: string` field, rendered as a second line under `label`. Existing consumers (`chat.js`) are unaffected since `description` is optional.

- [ ] **Step 1: Write the failing test**

Create `nx2/test/unit/nx/blocks/shared/menu/menu.test.js`:

```js
import { expect } from '@esm-bundle/chai';
import '../../../../../../blocks/shared/menu/menu.js';

async function createMenu(items) {
  const el = document.createElement('nx-menu');
  el.items = items;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

describe('nx-menu description', () => {
  afterEach(() => {
    document.querySelectorAll('nx-menu').forEach((el) => el.remove());
  });

  it('renders a description line when item.description is set', async () => {
    const el = await createMenu([
      { id: 'idea', label: 'Submit an idea', description: 'Suggestions and feature requests' },
    ]);
    const desc = el.shadowRoot.querySelector('.menu-item-description');
    expect(desc).to.not.be.null;
    expect(desc.textContent).to.equal('Suggestions and feature requests');
  });

  it('does not render a description line when item.description is absent', async () => {
    const el = await createMenu([{ id: 'files', label: 'Files or images' }]);
    expect(el.shadowRoot.querySelector('.menu-item-description')).to.be.null;
  });

  it('still renders the label when description is present', async () => {
    const el = await createMenu([
      { id: 'bug', label: 'Report a bug', description: 'Problems using AEM' },
    ]);
    const label = el.shadowRoot.querySelector('.menu-item-label');
    expect(label.textContent).to.equal('Report a bug');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/shared/menu/menu.test.js" --node-resolve --port=2000`
Expected: FAIL — `.menu-item-description` not found (first test fails because the element doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `nx2/blocks/shared/menu/menu.js`, replace the `_renderItem` method's item body:

```js
  _renderItem(item) {
    if (item.divider) return html`<li role="separator"><hr class="menu-divider"></li>`;
    if (item.section) return html`<li role="presentation"><span class="menu-section">${item.section}</span></li>`;
    if (!item.label || !item.id) return nothing;

    return html`
      <li role="none">
        <button
          role="menuitem"
          data-id=${item.id}
          class="menu-item ${item.id === this._active ? 'menu-item-active' : ''}"
          type="button"
          @click=${() => this._select(item)}
          @mouseenter=${() => { this._active = item.id; }}
          @focus=${() => { this._active = item.id; }}
        >
          ${item.icon ? html`<svg class="menu-item-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-${item.icon}-20-n.svg#icon"></use></svg>` : nothing}
          <span class="menu-item-text">
            <span class="menu-item-label">${item.label}</span>
            ${item.description ? html`<span class="menu-item-description">${item.description}</span>` : nothing}
          </span>
        </button>
      </li>
    `;
  }
```

In `nx2/blocks/shared/menu/menu.css`, add after the `.menu-item-icon` rule block:

```css
.menu-item-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.menu-item-description {
  color: light-dark(var(--s2-gray-600), var(--s2-gray-700));
  font-size: var(--s2-body-size-xxs);
  line-height: var(--s2-component-xs-regular-line-height);
  text-align: left;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/shared/menu/menu.test.js" --node-resolve --port=2000`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full nx2 chat test suite to confirm no regression**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/chat/*.test.(js|html)" --node-resolve --port=2000`
Expected: PASS (no change in chat's use of `nx-menu`, since `description` is optional).
If `nx2/test/unit/nx/blocks/chat` doesn't exist as a test path, skip this step — there's no existing chat test suite to protect, note it in the commit message.

- [ ] **Step 6: Commit**

```bash
git add nx2/blocks/shared/menu/menu.js nx2/blocks/shared/menu/menu.css nx2/test/unit/nx/blocks/shared/menu/menu.test.js
git commit -m "feat(shared-menu): support optional description line on menu items"
```

---

## Task 2: Register `nx-feedback` as an auto-block

**Files:**
- Modify: `nx2/scripts/scripts.js`

**Interfaces:**
- Consumes: nothing (config-only change).
- Produces: any anchor whose `pathname` includes `/fragments/nav/feedback` gets `classList` `nx-feedback auto-block` and is loaded via `nx2/blocks/feedback/feedback.js` (created in Task 3). This must land **before** the generic `{ fragment: '/fragments/' }` entry in the array, since `decorateLink` in `nx2/scripts/nx.js` uses `Array.prototype.some` and stops at the first match.

- [ ] **Step 1: Modify `linkBlocks`**

In `nx2/scripts/scripts.js`, change:

```js
const linkBlocks = [
  { fragment: '/fragments/' },
  { 'action-button': '/tools/widgets/panel' },
];
```

to:

```js
const linkBlocks = [
  { 'nx-feedback': '/fragments/nav/feedback' },
  { fragment: '/fragments/' },
  { 'action-button': '/tools/widgets/panel' },
];
```

- [ ] **Step 2: Verify existing config tests still pass**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/scripts/nx.test.js" --node-resolve --port=2000`
Expected: PASS. These tests assert on the framework default (`linkBlocks: conf.linkBlocks || [{ fragment: '/fragments/' }]`) inside `nx.js`, not on `scripts.js`'s own array, so they are unaffected by this change. Confirm this holds; if any test imports `scripts.js` directly and asserts on `linkBlocks`, update its expectation to include the new entry.

- [ ] **Step 3: Commit**

```bash
git add nx2/scripts/scripts.js
git commit -m "feat(nav): route /fragments/nav/feedback links to the nx-feedback block"
```

---

## Task 3: `parseFeedbackItems` pure helper

**Files:**
- Create: `nx2/blocks/feedback/feedback.js` (this task adds only the helper + its export; the rest of the file is built in Task 4)
- Test: `nx2/test/unit/nx/blocks/feedback/feedback.test.js`

**Interfaces:**
- Produces: `export function parseFeedbackItems(fragment: HTMLElement): Array<{ id: string, label: string, description?: string, icon?: string, href: string }>`. `fragment` is the root element returned by `loadFragment()` (a `<div class="fragment-content">` whose children are `<p>` rows, per the `/fragments/nav/feedback` content shape).

- [ ] **Step 1: Write the failing test**

Create `nx2/test/unit/nx/blocks/feedback/feedback.test.js`:

```js
import { expect } from '@esm-bundle/chai';
import { parseFeedbackItems } from '../../../../../blocks/feedback/feedback.js';

const FEEDBACK_FRAGMENT_HTML = `
  <div>
    <p><a href="#idea"><span class="icon icon-idea"></span>Submit an idea</a><br><em>Suggestions and feature requests</em></p>
    <p><a href="#bug"><span class="icon icon-bug"></span>Report a bug</a><br><em>Problems using AEM</em></p>
    <p><a href="https://discord.gg/X8D9JhyDX"><span class="icon icon-discord"></span>Join our Discord Server</a><br><em>Discussion forum</em></p>
  </div>
`;

function buildFragment(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.firstElementChild;
}

describe('parseFeedbackItems', () => {
  it('parses each row into an item with id, label, description, icon, and href', () => {
    const items = parseFeedbackItems(buildFragment(FEEDBACK_FRAGMENT_HTML));
    expect(items).to.have.lengthOf(3);
    expect(items[0]).to.deep.equal({
      id: 'idea',
      label: 'Submit an idea',
      description: 'Suggestions and feature requests',
      icon: 'idea',
      href: '#idea',
    });
    expect(items[1]).to.deep.equal({
      id: 'bug',
      label: 'Report a bug',
      description: 'Problems using AEM',
      icon: 'bug',
      href: '#bug',
    });
  });

  it('uses the icon name as id for external links (no hash)', () => {
    const items = parseFeedbackItems(buildFragment(FEEDBACK_FRAGMENT_HTML));
    expect(items[2]).to.deep.equal({
      id: 'discord',
      label: 'Join our Discord Server',
      description: 'Discussion forum',
      icon: 'discord',
      href: 'https://discord.gg/X8D9JhyDX',
    });
  });

  it('falls back to a positional id when there is no icon and no hash href', () => {
    const items = parseFeedbackItems(buildFragment(`
      <div><p><a href="https://example.com">No icon link</a></p></div>
    `));
    expect(items).to.deep.equal([{
      id: 'link-0',
      label: 'No icon link',
      description: undefined,
      icon: undefined,
      href: 'https://example.com',
    }]);
  });

  it('skips rows without a link', () => {
    const items = parseFeedbackItems(buildFragment('<div><p>No link here</p></div>'));
    expect(items).to.deep.equal([]);
  });

  it('omits description when there is no <em>', () => {
    const items = parseFeedbackItems(buildFragment(`
      <div><p><a href="#idea"><span class="icon icon-idea"></span>Submit an idea</a></p></div>
    `));
    expect(items[0].description).to.be.undefined;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/feedback/feedback.test.js" --node-resolve --port=2000`
Expected: FAIL — `feedback.js` doesn't exist yet (module resolution error).

- [ ] **Step 3: Write minimal implementation**

Create `nx2/blocks/feedback/feedback.js` with just the helper for now (the rest is added in Task 4):

```js
export function parseFeedbackItems(fragment) {
  // Descendant search (not :scope > p): loadFragment() wraps the authored
  // content div inside its own "fragment-content" div, so rows can be nested
  // one level deeper than fragment's direct children. Plain descendant search
  // works for both that shape and a bare div passed directly in tests.
  const rows = [...fragment.querySelectorAll('p')];
  return rows.reduce((items, p, index) => {
    const a = p.querySelector('a');
    if (!a) return items;

    const iconSpan = a.querySelector('span.icon');
    const iconClass = iconSpan
      ? [...iconSpan.classList].find((cls) => cls !== 'icon' && cls.startsWith('icon-'))
      : undefined;
    const icon = iconClass ? iconClass.slice('icon-'.length) : undefined;

    const href = a.getAttribute('href') || '';
    const em = p.querySelector('em');

    items.push({
      id: href.startsWith('#') ? href.slice(1) : (icon || `link-${index}`),
      label: a.textContent.trim(),
      description: em ? em.textContent.trim() : undefined,
      icon,
      href,
    });
    return items;
  }, []);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/feedback/feedback.test.js" --node-resolve --port=2000`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add nx2/blocks/feedback/feedback.js nx2/test/unit/nx/blocks/feedback/feedback.test.js
git commit -m "feat(feedback): add parseFeedbackItems helper"
```

---

## Task 4: `init(a)` — turn the Feedback link into a button + `<nx-feedback-menu>`

**Files:**
- Modify: `nx2/blocks/feedback/feedback.js`
- Test: `nx2/test/unit/nx/blocks/feedback/feedback.test.js`

**Interfaces:**
- Consumes: `parseFeedbackItems` (Task 3, same file).
- Produces: `export default function init(a: HTMLAnchorElement): void` — the auto-block entry point `loadBlock` calls. Replaces `a` with `<nx-feedback-menu>` containing a `<button slot="trigger">`.

- [ ] **Step 1: Write the failing test**

Append to `nx2/test/unit/nx/blocks/feedback/feedback.test.js`:

```js
import init from '../../../../../blocks/feedback/feedback.js';

function buildAnchor({ href = '/fragments/nav/feedback', className = 'nx-feedback auto-block' } = {}) {
  const a = document.createElement('a');
  a.href = href;
  a.className = className;
  a.innerHTML = '<span class="icon icon-feedback"></span>Feedback';
  document.body.append(a);
  return a;
}

describe('feedback init', () => {
  afterEach(() => {
    document.querySelectorAll('a, nx-feedback-menu').forEach((el) => el.remove());
  });

  it('replaces the anchor with a nx-feedback-menu wrapping a trigger button', () => {
    const a = buildAnchor();
    init(a);

    expect(document.querySelector('a.nx-feedback')).to.be.null;
    const wrapper = document.querySelector('nx-feedback-menu');
    expect(wrapper).to.not.be.null;

    const button = wrapper.querySelector('button[slot="trigger"]');
    expect(button).to.not.be.null;
    expect(button.className).to.equal('nx-feedback auto-block');
    expect(button.dataset.pathname).to.equal('/fragments/nav/feedback');
    expect(button.querySelector('span.icon.icon-feedback')).to.not.be.null;
    expect(button.textContent.trim()).to.equal('Feedback');
  });

  it('sets the wrapper path from the anchor pathname', () => {
    const a = buildAnchor();
    init(a);
    const wrapper = document.querySelector('nx-feedback-menu');
    expect(wrapper.path).to.equal('/fragments/nav/feedback');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/feedback/feedback.test.js" --node-resolve --port=2000`
Expected: FAIL — no default export from `feedback.js`, and `nx-feedback-menu` is undefined.

- [ ] **Step 3: Write minimal implementation**

Append to `nx2/blocks/feedback/feedback.js` (this defines the custom element used by `init`, satisfying the test's `document.querySelector('nx-feedback-menu')` check — even a minimal `HTMLElement` stand-in registered now, fully fleshed out with Lit behavior in Task 5):

```js
class NxFeedbackMenu extends HTMLElement {
  set path(value) { this._path = value; }

  get path() { return this._path; }
}

if (!customElements.get('nx-feedback-menu')) customElements.define('nx-feedback-menu', NxFeedbackMenu);

export default function init(a) {
  const button = document.createElement('button');
  button.append(...a.childNodes);
  button.className = a.className;
  button.dataset.pathname = a.pathname;
  button.setAttribute('slot', 'trigger');

  const wrapper = document.createElement('nx-feedback-menu');
  wrapper.path = a.pathname;
  wrapper.append(button);

  a.replaceWith(wrapper);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/feedback/feedback.test.js" --node-resolve --port=2000`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add nx2/blocks/feedback/feedback.js nx2/test/unit/nx/blocks/feedback/feedback.test.js
git commit -m "feat(feedback): convert the feedback link into a button + nx-feedback-menu wrapper"
```

---

## Task 5: `NxFeedbackMenu` — load items, render `nx-menu`, handle select

**Files:**
- Modify: `nx2/blocks/feedback/feedback.js` (replace the placeholder `NxFeedbackMenu` from Task 4 with the full Lit implementation)
- Create: `nx2/blocks/feedback/feedback.css`
- Test: `nx2/test/unit/nx/blocks/feedback/feedback.test.js`

**Interfaces:**
- Consumes:
  - `parseFeedbackItems` (Task 3, same file).
  - `loadFragment(path: string): Promise<HTMLElement|null>` from `nx2/blocks/fragment/fragment.js`.
  - `loadStyle(url: string): Promise<CSSStyleSheet>` from `nx2/utils/utils.js`.
  - `<nx-menu>` from `nx2/blocks/shared/menu/menu.js` (Task 1) — `.items`, `@select` with `{ detail: { id } }`.
  - `<nx-dialog>` from `nx2/blocks/shared/dialog/dialog.js` — `title` attribute, default slot for body, `slot="actions"` for buttons, `@close`.
  - `<sl-button>` from `nx2/public/sl/components.js`.
- Produces: `NxFeedbackMenu.path` (string, set by `init`), rendered menu items, `_handleSelect` opens `<nx-dialog>` for `#`-prefixed hrefs and `window.open` for others.

- [ ] **Step 1: Write the failing tests**

Append to `nx2/test/unit/nx/blocks/feedback/feedback.test.js`:

```js
const FRAGMENT_CONTAINER_ID = 'feedback-test-fragment-container';

function mockFeedbackFragmentFetch(html = FEEDBACK_FRAGMENT_HTML) {
  // html is already a single top-level <div>...</div> (the authored fragment
  // shape) — that div itself becomes the one `main > div` section loadFragment()
  // looks for, matching real /fragments/nav/feedback content.
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/fragments/nav/feedback')) {
      return new Response(`<html><body><main>${html}</main></body></html>`, {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
      });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

describe('NxFeedbackMenu', () => {
  let restoreFetch;

  afterEach(() => {
    restoreFetch?.();
    document.querySelectorAll('a, nx-feedback-menu').forEach((el) => el.remove());
  });

  it('loads and parses items from the fragment on connect', async () => {
    restoreFetch = mockFeedbackFragmentFetch();
    const a = buildAnchor();
    init(a);
    const wrapper = document.querySelector('nx-feedback-menu');
    await wrapper.updateComplete;
    await new Promise((r) => { setTimeout(r, 50); });
    await wrapper.updateComplete;

    expect(wrapper._items).to.have.lengthOf(3);
    expect(wrapper._items[0].id).to.equal('idea');
  });

  it('opens a dialog for a hash-href item on select', async () => {
    restoreFetch = mockFeedbackFragmentFetch();
    const a = buildAnchor();
    init(a);
    const wrapper = document.querySelector('nx-feedback-menu');
    await wrapper.updateComplete;
    await new Promise((r) => { setTimeout(r, 50); });
    await wrapper.updateComplete;

    await wrapper._handleSelect({ detail: { id: 'idea' } });
    await wrapper.updateComplete;

    expect(wrapper._dialog).to.deep.equal({ id: 'idea', titleText: 'Submit an idea' });
    const dialog = wrapper.shadowRoot.querySelector('nx-dialog');
    expect(dialog).to.not.be.null;
    expect(dialog.getAttribute('title')).to.equal('Submit an idea');
  });

  it('opens an external link in a new tab on select instead of a dialog', async () => {
    restoreFetch = mockFeedbackFragmentFetch();
    const a = buildAnchor();
    init(a);
    const wrapper = document.querySelector('nx-feedback-menu');
    await wrapper.updateComplete;
    await new Promise((r) => { setTimeout(r, 50); });
    await wrapper.updateComplete;

    const openStub = sinon.stub(window, 'open');
    await wrapper._handleSelect({ detail: { id: 'discord' } });

    expect(openStub.calledOnceWith('https://discord.gg/X8D9JhyDX', '_blank', 'noopener,noreferrer')).to.be.true;
    expect(wrapper._dialog).to.be.undefined;
    openStub.restore();
  });

  it('closes the dialog and clears state on submit (no network call)', async () => {
    restoreFetch = mockFeedbackFragmentFetch();
    const a = buildAnchor();
    init(a);
    const wrapper = document.querySelector('nx-feedback-menu');
    await wrapper.updateComplete;
    await new Promise((r) => { setTimeout(r, 50); });
    await wrapper.updateComplete;

    await wrapper._handleSelect({ detail: { id: 'bug' } });
    await wrapper.updateComplete;
    expect(wrapper._dialog).to.not.be.undefined;

    wrapper._submitDialog();
    expect(wrapper._dialog).to.be.undefined;
  });
});
```

Add `import sinon from 'sinon';` to the top of the test file alongside the existing imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/feedback/feedback.test.js" --node-resolve --port=2000`
Expected: FAIL — `wrapper._items` undefined, `wrapper.updateComplete` undefined (placeholder `NxFeedbackMenu` isn't a `LitElement` yet), `_handleSelect`/`_submitDialog` don't exist.

- [ ] **Step 3: Write minimal implementation**

Replace the placeholder `NxFeedbackMenu` class in `nx2/blocks/feedback/feedback.js` (keep `parseFeedbackItems` and `init` as-is, add these imports at the top of the file and swap the class body):

```js
import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import '../shared/menu/menu.js';

const NX_BASE = new URL('../../', import.meta.url).href.replace(/\/$/, '');
const style = await loadStyle(import.meta.url);

export function parseFeedbackItems(fragment) {
  // ...unchanged from Task 3...
}

class NxFeedbackMenu extends LitElement {
  static properties = {
    path: { attribute: false },
    _items: { state: true },
    _loadFailed: { state: true },
    _dialog: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._loadItems();
  }

  async _loadItems() {
    const fragment = await loadFragment(this.path);
    if (!fragment) {
      this._loadFailed = true;
      return;
    }
    this._items = parseFeedbackItems(fragment);
  }

  async _handleSelect({ detail: { id } }) {
    const item = this._items?.find((i) => i.id === id);
    if (!item) return;

    if (item.href.startsWith('#')) {
      await Promise.all([
        import('../shared/dialog/dialog.js'),
        import(`${NX_BASE}/public/sl/components.js`),
      ]);
      this._dialog = { id: item.id, titleText: item.label };
      return;
    }

    if (item.href) window.open(item.href, '_blank', 'noopener,noreferrer');
  }

  _closeDialog() {
    this._dialog = undefined;
  }

  _submitDialog() {
    // TODO: POST to feedback endpoint in a follow-up iteration.
    this._dialog = undefined;
  }

  _renderDialog() {
    if (!this._dialog) return nothing;
    return html`
      <nx-dialog title=${this._dialog.titleText} @close=${this._closeDialog}>
        <textarea class="feedback-textarea" autofocus placeholder="Tell us more..."></textarea>
        <sl-button slot="actions" @click=${this._closeDialog}>Cancel</sl-button>
        <sl-button slot="actions" @click=${this._submitDialog}>Submit</sl-button>
      </nx-dialog>
    `;
  }

  render() {
    return html`
      <nx-menu .items=${this._items ?? []} placement="below-end" @select=${this._handleSelect}>
        <slot name="trigger"></slot>
      </nx-menu>
      ${this._renderDialog()}
    `;
  }
}

if (!customElements.get('nx-feedback-menu')) customElements.define('nx-feedback-menu', NxFeedbackMenu);

export default function init(a) {
  // ...unchanged from Task 4...
}
```

Create `nx2/blocks/feedback/feedback.css`:

```css
:host {
  display: contents;
}

.feedback-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 120px;
  padding: var(--s2-spacing-100);
  border: 1px solid var(--s2-gray-200);
  border-radius: var(--s2-corner-radius-200);
  font-family: inherit;
  font-size: var(--s2-body-size-xs);
  resize: vertical;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/feedback/feedback.test.js" --node-resolve --port=2000`
Expected: PASS (11 tests total).

- [ ] **Step 5: Register the new custom element in the define-guard test**

In `nx2/test/unit/nx/blocks/shared/custom-element-guard.test.js`, add to the `COMPONENTS` array:

```js
  { name: 'nx-feedback-menu', path: '../../../../../blocks/feedback/feedback.js' },
```

Run: `npx wtr --config ./nx2/test/wtr.config.mjs "./nx2/test/unit/nx/blocks/shared/custom-element-guard.test.js" --node-resolve --port=2000`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add nx2/blocks/feedback/feedback.js nx2/blocks/feedback/feedback.css nx2/test/unit/nx/blocks/feedback/feedback.test.js nx2/test/unit/nx/blocks/shared/custom-element-guard.test.js
git commit -m "feat(feedback): load fragment items, render nx-menu, open stub dialog on select"
```

---

## Task 6: Nav action-area styling for the feedback button

**Files:**
- Modify: `nx2/blocks/nav/nav.css`

**Interfaces:**
- Consumes: nothing new — relies on the button's class (`nx-feedback auto-block`, but the button's *first* class after decoration is `nx-feedback`, matching the existing `.dialog`/`.profile` selector pattern which targets `button.dialog`/`button.profile` — i.e., the un-prefixed name). Since `decorateLink` adds `nx-feedback` as the literal class (not stripped), and `nav.css`'s existing rules use `.dialog`/`.profile` (also literal, un-prefixed, matching how `nx-dialog`/`nx-profile` elements happen to carry a plain second class in current markup)... **note:** re-check actual class before writing the selector — see Step 1.

- [ ] **Step 1: Confirm the exact class to target**

Per the confirmed rendered markup from the design spec, the button's class is exactly `nx-feedback auto-block` (no separate plain `feedback` class). The existing `nav.css` rules for `.dialog` / `.profile` target the *nx-prefixed* class as a literal CSS class selector (`.dialog` matches an element with class `dialog`, but our button's class is `nx-feedback`, not `feedback`). Use `.nx-feedback` as the selector to match the actual class present on the button — do **not** assume a bare `.feedback` class exists.

- [ ] **Step 2: Add the CSS rule**

In `nx2/blocks/nav/nav.css`, inside the `.action-area button { ... }` block, add a new rule alongside the existing `&.dialog` and `&.profile` rules:

```css
    &.nx-feedback {
      font-size: 0;
    }
```

- [ ] **Step 3: Manual visual check**

Run the nx2 dev/demo page (or serve the repo and load a page with `?nx=<this-branch>` if testing against a consumer, or directly open a local nx2 nav demo page if one exists under `nx2/`), confirm:
- The Feedback icon renders next to the profile avatar, icon-only (no visible "Feedback" text), consistent sizing with the other action buttons.
- Clicking it opens the menu with three items, each icon + title + description (idea/bug) or icon + title only styling consistency (Discord item still shows a description per content, so all three will show two lines — confirm this still looks correct against the Figma reference).
- Clicking "Submit an idea" / "Report a bug" opens the stub dialog with the correct title, a textarea, and Cancel/Submit buttons; Submit and Cancel both close it.
- Clicking "Join our Discord Server" opens the Discord URL in a new tab and does not open a dialog.
- Verify in both light and dark mode (toggle via the profile menu's contrast icon or OS theme).

If no local demo page exists for manually exercising `nx2/blocks/nav`, note this in the task's completion comment and defer full visual verification to a review environment (e.g., a PR preview) — do not skip the automated tests above.

- [ ] **Step 4: Commit**

```bash
git add nx2/blocks/nav/nav.css
git commit -m "style(nav): add icon-only sizing for the feedback action button"
```

---

## Self-Review Notes

- **Spec coverage:** linkBlocks wiring (Task 2), button/wrapper shape matching the Help button convention (Task 4), fragment parsing generic to href shape (Task 3), nx-menu reuse with description extension (Task 1, 5), dialog stub with no network call (Task 5), external Discord link handling (Task 5), nav CSS (Task 6). Icon assets and Help button fixes are explicitly out of scope per Global Constraints.
- **Type consistency:** `parseFeedbackItems` return shape (`{ id, label, description, icon, href }`) is used identically in Task 3's tests, Task 5's `_handleSelect`, and matches what `nx-menu`'s extended `_renderItem` (Task 1) expects (`id`, `label`, `icon`, `description`).
- **No placeholders:** all steps contain complete, runnable code; the only intentional stub is the dialog's `_submitDialog` no-op, called out explicitly as deferred scope in the Global Constraints and design spec.
