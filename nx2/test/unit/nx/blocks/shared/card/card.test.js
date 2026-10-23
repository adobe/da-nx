import { expect } from '@esm-bundle/chai';
import '../../../../../../blocks/shared/card/card.js';

describe('nx-card', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-card');
    el.innerHTML = `<a slot="preview" href="#file">Preview</a>
      <a slot="title" href="#file">File title</a>
      <button slot="actions" type="button">More</button>
      <span slot="metadata">Modified today</span>`;
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('projects app-owned content without duplicating links or controls', () => {
    ['preview', 'title', 'actions', 'metadata'].forEach((name) => {
      const slot = el.shadowRoot.querySelector(`slot[name="${name}"]`);
      expect(slot.assignedElements()).to.have.length(1);
    });
    expect(el.shadowRoot.querySelector('a, button')).to.equal(null);
  });

  it('keeps optional badges and selection separate from the preview link', () => {
    const badge = document.createElement('span');
    badge.slot = 'badge';
    badge.textContent = 'Favorite';
    el.append(badge);
    expect(el.shadowRoot.querySelector('slot[name="badge"]').assignedElements()).to.deep.equal([badge]);
    expect(el.shadowRoot.querySelector('slot[name="selection"]').assignedElements()).to.have.length(0);
  });

  it('supports the compact preview without changing an application UI-size setting', () => {
    el.style.setProperty('--nx-card-preview-height', '80px');
    el.style.setProperty('--nx-card-preview-ratio', 'auto');
    expect(getComputedStyle(el.shadowRoot.querySelector('.preview')).height).to.equal('80px');
    expect(el.hasAttribute('data-ui-size')).to.equal(false);
  });
});
