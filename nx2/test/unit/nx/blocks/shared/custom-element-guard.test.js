import { expect } from '@esm-bundle/chai';

const COMPONENTS = [
  { name: 'nx-popover', path: '../../../../../blocks/shared/popover/popover.js' },
  { name: 'nx-menu', path: '../../../../../blocks/shared/menu/menu.js' },
  { name: 'nx-picker', path: '../../../../../blocks/shared/picker/picker.js' },
  { name: 'nx-breadcrumb', path: '../../../../../blocks/shared/breadcrumb/breadcrumb.js' },
  { name: 'nx-dialog', path: '../../../../../blocks/shared/dialog/dialog.js' },
  { name: 'nx-toast', path: '../../../../../blocks/shared/toast/toast.js' },
];

describe('shared component define guards', () => {
  for (const { name, path } of COMPONENTS) {
    describe(name, () => {
      it('registers the element when not already defined', async () => {
        if (customElements.get(name)) return;
        await import(path);
        expect(customElements.get(name)).to.exist;
      });

      it('does not throw when the element is already registered', async () => {
        const existing = customElements.get(name);
        if (!existing) {
          customElements.define(name, class extends HTMLElement {});
        }
        let threw = false;
        try {
          await import(`${path}?guard=${Date.now()}`);
        } catch (e) {
          threw = true;
        }
        expect(threw).to.be.false;
      });

      it('preserves the first registered class', async () => {
        const registered = customElements.get(name);
        expect(registered).to.exist;
        await import(`${path}?preserve=${Date.now()}`);
        expect(customElements.get(name)).to.equal(registered);
      });
    });
  }
});
