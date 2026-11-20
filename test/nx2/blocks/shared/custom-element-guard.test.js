import { expect } from '@esm-bundle/chai';

const COMPONENTS = [
  { name: 'nx-popover', path: '../../../../nx2/blocks/shared/popover/popover.js' },
  { name: 'nx-menu', path: '../../../../nx2/blocks/shared/menu/menu.js' },
  { name: 'nx-picker', path: '../../../../nx2/blocks/shared/picker/picker.js' },
  { name: 'nx-breadcrumb', path: '../../../../nx2/blocks/shared/breadcrumb/breadcrumb.js' },
  { name: 'nx-dialog', path: '../../../../nx2/blocks/shared/dialog/dialog.js' },
  { name: 'nx-toast', path: '../../../../nx2/blocks/shared/toast/toast.js' },
];

// Imports here use runtime-built specifiers, so the dev server can't rewrite them
// to carry the import map id (`?wds-import-map=N`). Without it, bare imports like
// `da-lit` inside the component fail to resolve. Copy this module's query params
// onto the target URL so the import map still applies.
const moduleHref = (path, params = {}) => {
  const url = new URL(path, import.meta.url);
  new URL(import.meta.url).searchParams.forEach((v, k) => url.searchParams.set(k, v));
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.href;
};

describe('shared component define guards', () => {
  for (const { name, path } of COMPONENTS) {
    describe(name, () => {
      it('registers the element when not already defined', async () => {
        if (customElements.get(name)) return;
        await import(moduleHref(path));
        expect(customElements.get(name)).to.exist;
      });

      it('does not throw when the element is already registered', async () => {
        const existing = customElements.get(name);
        if (!existing) {
          customElements.define(name, class extends HTMLElement {});
        }
        let threw = false;
        try {
          await import(moduleHref(path, { guard: Date.now() }));
        } catch (e) {
          threw = true;
        }
        expect(threw).to.be.false;
      });

      it('preserves the first registered class', async () => {
        const registered = customElements.get(name);
        expect(registered).to.exist;
        await import(moduleHref(path, { preserve: Date.now() }));
        expect(customElements.get(name)).to.equal(registered);
      });
    });
  }
});
