import { expect } from '@esm-bundle/chai';
import '../../../../../nx/blocks/form/views/array-menu.js';

// The remove action is gated by _canRemove. Removal is never floored — any row
// can be deleted (readonly aside). Dropping below minItems, on a required array
// or not, surfaces as a validation error rather than being blocked, matching
// the SDK's canRemove and the engine's non-blocking model.

const tick = () => new Promise((r) => { requestAnimationFrame(r); });
const settle = async (el) => {
  await el.updateComplete;
  await tick();
  await el.updateComplete;
};

const mounted = [];
afterEach(() => { while (mounted.length) mounted.pop().remove(); });

async function mountMenu(props) {
  const el = window.document.createElement('nx-array-menu');
  Object.assign(el, { pointer: '/data/items/0', index: 0, open: true, ...props });
  window.document.body.append(el);
  mounted.push(el);
  await settle(el);
  return el;
}

const removeButton = (el) => [...el.shadowRoot.querySelectorAll('.menu-item')]
  .find((b) => /remov/i.test(b.textContent));

describe('nx-array-menu remove gating', () => {
  it('keeps remove enabled on an optional array below minItems', async () => {
    const el = await mountMenu({ required: false, minItems: 3, itemCount: 1 });
    expect(removeButton(el).disabled).to.equal(false);
  });

  it('keeps remove enabled on a required array at its minItems (flagged, not blocked)', async () => {
    const el = await mountMenu({ required: true, minItems: 3, itemCount: 3 });
    expect(removeButton(el).disabled).to.equal(false);
  });

  it('disables remove only when there are no rows to remove', async () => {
    const el = await mountMenu({ required: true, minItems: 3, itemCount: 0 });
    expect(removeButton(el).disabled).to.equal(true);
  });

  it('never allows remove when readonly', async () => {
    const el = await mountMenu({ required: false, minItems: 0, itemCount: 5, readonly: true });
    expect(removeButton(el).disabled).to.equal(true);
  });
});
