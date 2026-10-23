import { expect } from '@esm-bundle/chai';
import '../../../../blocks/shared/card/card.js';

describe('nx-card', () => {
  let card;

  beforeEach(async () => {
    card = document.createElement('nx-card');
    document.body.append(card);
    await card.updateComplete;
  });

  afterEach(() => card.remove());

  it('defaults dimensions to m and size to s and reflects them', () => {
    expect(card.dimensions).to.equal('m');
    expect(card.size).to.equal('s');
    expect(card.getAttribute('dimensions')).to.equal('m');
    expect(card.getAttribute('size')).to.equal('s');
  });

  it('keeps dimensions and size independent', async () => {
    card.dimensions = 'l';
    await card.updateComplete;
    expect(card.size).to.equal('s');

    card.size = 'l';
    card.dimensions = 's';
    await card.updateComplete;
    expect(card.dimensions).to.equal('s');
    expect(card.size).to.equal('l');
  });

  it('falls back to defaults for unsupported values', async () => {
    card.dimensions = 'xl';
    card.size = 'huge';
    await card.updateComplete;
    expect(card.dimensions).to.equal('m');
    expect(card.size).to.equal('s');
  });

  it('renders no selection control unless selectable', async () => {
    expect(card.shadowRoot.querySelector('input')).to.equal(null);
    card.selectable = true;
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('input').getAttribute('aria-label')).to.equal('Select item');
  });

  it('uses selection-label for the control name', async () => {
    card.selectable = true;
    card.selectionLabel = 'Select about-us';
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('input').getAttribute('aria-label')).to.equal('Select about-us');
  });

  it('emits selectionchange and follows the consumer-controlled selected state', async () => {
    card.selectable = true;
    card.addEventListener('selectionchange', (e) => { card.selected = e.detail.selected; });
    await card.updateComplete;
    const input = card.shadowRoot.querySelector('input');

    input.click();
    await card.updateComplete;
    expect(card.selected).to.equal(true);
    expect(input.checked).to.equal(true);

    input.click();
    await card.updateComplete;
    expect(card.selected).to.equal(false);
    expect(input.checked).to.equal(false);
  });

  it('reverts the checkbox when the consumer does not update selected', async () => {
    card.selectable = true;
    let detail;
    card.addEventListener('selectionchange', (e) => { detail = e.detail; });
    await card.updateComplete;
    const input = card.shadowRoot.querySelector('input');

    input.click();
    await card.updateComplete;
    await Promise.resolve();
    expect(detail).to.deep.equal({ selected: true });
    expect(input.checked).to.equal(false);
  });

  it('keeps metadata outside the content slot so it survives replacement', () => {
    const content = card.shadowRoot.querySelector('slot[name="content"]');
    expect(content.querySelector('slot[name="heading"]')).to.exist;
    expect(content.querySelector('slot[name="actions"]')).to.exist;
    expect(content.querySelector('slot[name="metadata"]')).to.equal(null);
  });

  it('exposes the documented slots', () => {
    const names = [...card.shadowRoot.querySelectorAll('slot')].map((s) => s.name);
    expect(names).to.have.members([
      'media', 'overlay-actions', 'content', 'heading', 'actions', 'metadata',
    ]);
  });
});
