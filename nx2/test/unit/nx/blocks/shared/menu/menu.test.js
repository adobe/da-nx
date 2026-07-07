import { expect } from '@esm-bundle/chai';
import '../../../../../../blocks/shared/menu/menu.js';

async function buildMenu(items) {
  const el = document.createElement('nx-menu');
  el.items = items;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('nx-menu subtitle', () => {
  it('renders a subtitle when the item has one', async () => {
    const el = await buildMenu([{ id: 'a', label: 'Banner', subtitle: 'small, blue' }]);
    const subtitle = el.shadowRoot.querySelector('.menu-item-subtitle');
    expect(subtitle).to.not.be.null;
    expect(subtitle.textContent).to.contain('small, blue');
  });

  it('does not render a subtitle element when absent', async () => {
    const el = await buildMenu([{ id: 'a', label: 'Banner' }]);
    expect(el.shadowRoot.querySelector('.menu-item-subtitle')).to.be.null;
  });

  it('still renders the label', async () => {
    const el = await buildMenu([{ id: 'a', label: 'Banner', subtitle: 'small' }]);
    const label = el.shadowRoot.querySelector('.menu-item-label');
    expect(label.textContent).to.contain('Banner');
  });
});

describe('nx-menu hint', () => {
  it('renders a non-interactive hint line', async () => {
    const el = await buildMenu([
      { hint: 'Type a block name to search the library' },
      { id: 'a', label: 'Open block library' },
    ]);
    const hint = el.shadowRoot.querySelector('.menu-hint');
    expect(hint).to.not.be.null;
    expect(hint.textContent).to.contain('Type a block name');
    // Hint is presentation-only: it is not a focusable menuitem.
    expect(hint.closest('button')).to.be.null;
  });

  it('skips the hint when choosing the initial active item', async () => {
    const el = await buildMenu([
      { hint: 'Type a block name to search the library' },
      { id: 'first-real', label: 'Open block library' },
    ]);
    el._onMenuToggle({ newState: 'open' });
    expect(el._active).to.equal('first-real');
  });
});
