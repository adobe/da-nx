import { expect } from '@esm-bundle/chai';
import '../../../../../../blocks/shared/card/card.js';

describe('nx-card', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-card');
    el.layout = 'compact';
    el.innerHTML = `<a slot="media" href="#file">Preview</a>
      <a slot="heading" href="#file">File title</a>
      <button slot="actions" type="button">More</button>
      <span slot="metadata">Modified today</span>`;
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('projects app-owned content without duplicating links or controls', () => {
    ['media', 'heading', 'actions', 'metadata'].forEach((name) => {
      const slot = el.shadowRoot.querySelector(`slot[name="${name}"]`);
      expect(slot.assignedElements()).to.have.length(1);
    });
    expect(el.shadowRoot.querySelector('a, button')).to.equal(null);
  });

  it('keeps optional badges and selection separate from the preview link', () => {
    const badge = document.createElement('span');
    badge.slot = 'overlay-actions';
    badge.textContent = 'Favorite';
    el.append(badge);
    expect(el.shadowRoot.querySelector('slot[name="overlay-actions"]').assignedElements()).to.deep.equal([badge]);
    expect(el.shadowRoot.querySelector('.select-target')).to.equal(null);
  });

  it('supports the compact preview without changing an application UI-size setting', () => {
    el.style.setProperty('--nx-card-preview-height', '80px');
    expect(getComputedStyle(el.shadowRoot.querySelector('.media')).height).to.equal('80px');
    expect(el.hasAttribute('data-ui-size')).to.equal(false);
  });

  it('uses the four-pixel spacing token rather than its eight-pixel neighbor', () => {
    el.style.setProperty('--s2-spacing-75', '4px');
    el.style.setProperty('--s2-spacing-100', '8px');
    el.style.setProperty('--s2-spacing-200', '12px');
    const frame = getComputedStyle(el.shadowRoot.querySelector('.card'));
    const content = getComputedStyle(el.shadowRoot.querySelector('.body'));
    expect(frame.padding).to.equal('4px');
    expect(frame.gap).to.equal('4px');
    expect(frame.borderRadius).to.equal('12px');
    expect(content.padding).to.equal('4px 12px');
  });
});
