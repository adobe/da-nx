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

  it('focuses the selection control through the card API without changing selection', async () => {
    card.selectable = true;
    await card.updateComplete;

    card.focus();

    expect(document.activeElement).to.equal(card);
    expect(card.shadowRoot.activeElement).to.equal(card.shadowRoot.querySelector('input'));
    expect(card.selected).to.equal(false);
  });

  it('forwards focus options to the selection control', async () => {
    card.selectable = true;
    await card.updateComplete;
    const input = card.shadowRoot.querySelector('input');
    const options = { preventScroll: true };
    let receivedOptions;
    input.focus = (value) => { receivedOptions = value; };

    card.focus(options);

    expect(receivedOptions).to.equal(options);
  });

  it('preserves host focus when the card is not selectable', () => {
    card.tabIndex = -1;

    card.focus();

    expect(document.activeElement).to.equal(card);
    expect(card.shadowRoot.activeElement).to.equal(null);
  });

  it('emits nx-card-selection-change and follows the consumer-controlled selected state', async () => {
    card.selectable = true;
    let cardClicks = 0;
    card.addEventListener('click', () => { cardClicks += 1; });
    card.addEventListener('nx-card-selection-change', (e) => { card.selected = e.detail.selected; });
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
    expect(cardClicks).to.equal(0);
  });

  it('reverts the checkbox when the consumer does not update selected', async () => {
    card.selectable = true;
    let detail;
    card.addEventListener('nx-card-selection-change', (e) => { detail = e.detail; });
    await card.updateComplete;
    const input = card.shadowRoot.querySelector('input');

    input.click();
    await card.updateComplete;
    await Promise.resolve();
    expect(detail).to.deep.equal({ selected: true, shiftKey: false });
    expect(input.checked).to.equal(false);
  });

  it('includes shift-click in selection changes for range selection', async () => {
    card.selectable = true;
    let detail;
    card.addEventListener('nx-card-selection-change', (e) => { detail = e.detail; });
    await card.updateComplete;
    card.shadowRoot.querySelector('input')
      .dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(detail).to.deep.equal({ selected: true, shiftKey: true });
  });

  it('selects from the extra hit area without triggering card clicks', async () => {
    card.selectable = true;
    let changes = 0;
    let cardClicks = 0;
    card.addEventListener('click', () => { cardClicks += 1; });
    card.addEventListener('nx-card-selection-change', (e) => {
      changes += 1;
      card.selected = e.detail.selected;
    });
    await card.updateComplete;
    const input = card.shadowRoot.querySelector('input');
    expect(input.parentElement.classList.contains('nx-checkbox')).to.equal(true);
    const bounds = input.getBoundingClientRect();
    const target = card.shadowRoot.elementFromPoint(bounds.left - 4, bounds.top + 7);
    expect(bounds.width).to.equal(14);
    expect(bounds.height).to.equal(14);
    expect(target).to.equal(input.parentElement);
    const hitArea = target.getBoundingClientRect();
    expect(hitArea.width).to.equal(26);
    expect(hitArea.height).to.equal(26);
    target.click();
    await card.updateComplete;
    expect(card.selected).to.equal(true);
    expect(input.checked).to.equal(true);
    expect(changes).to.equal(1);
    expect(cardClicks).to.equal(0);

    card.shadowRoot.querySelector('.body').click();
    expect(cardClicks).to.equal(1);
  });

  it('keeps metadata outside the content slot so it survives replacement', () => {
    const content = card.shadowRoot.querySelector('slot[name="content"]');
    expect(content.querySelector('slot[name="heading"]')).to.exist;
    expect(content.querySelector('slot[name="actions"]')).to.exist;
    expect(content.querySelector('slot[name="metadata"]')).to.equal(null);
  });

  it('bubbles card selection without dispatching the native selectionchange event name', async () => {
    card.selectable = true;
    await card.updateComplete;
    let detail;
    let nativeNameEvents = 0;
    card.addEventListener('selectionchange', () => { nativeNameEvents += 1; });
    const onSelection = (event) => {
      if (event.target === card) detail = event.detail;
    };
    document.addEventListener('nx-card-selection-change', onSelection);
    try {
      card.shadowRoot.querySelector('input').click();
      expect(detail).to.deep.equal({ selected: true, shiftKey: false });
      expect(nativeNameEvents).to.equal(0);
    } finally {
      document.removeEventListener('nx-card-selection-change', onSelection);
    }
  });

  it('exposes the documented slots', () => {
    const names = [...card.shadowRoot.querySelectorAll('slot')].map((s) => s.name);
    expect(names).to.have.members([
      'media', 'overlay-actions', 'content', 'heading', 'actions', 'metadata',
    ]);
  });
});
