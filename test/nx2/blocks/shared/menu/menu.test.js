import { expect } from '@esm-bundle/chai';
import '../../../../../nx2/blocks/shared/menu/menu.js';

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

  it('renders a color swatch when item.swatch is set', async () => {
    const el = await createMenu([{ id: 'red', label: 'Red', swatch: '#ff0000' }]);
    const swatch = el.shadowRoot.querySelector('.menu-item-swatch');
    expect(swatch).to.not.be.null;
    expect(swatch.style.background).to.equal('rgb(255, 0, 0)');
  });

  it('does not render a swatch when item.swatch is absent', async () => {
    const el = await createMenu([{ id: 'files', label: 'Files or images' }]);
    expect(el.shadowRoot.querySelector('.menu-item-swatch')).to.be.null;
  });

  it('renders a trailing status dot when item.statusDot is set', async () => {
    const el = await createMenu([{ id: 'publish', label: 'Publish', statusDot: 'rgb(0, 128, 0)' }]);
    const dot = el.shadowRoot.querySelector('.menu-item-status-dot');
    expect(dot).to.not.be.null;
    expect(dot.style.background).to.equal('rgb(0, 128, 0)');
    const text = el.shadowRoot.querySelector('.menu-item-text');
    // eslint-disable-next-line no-bitwise
    const isAfter = text.compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(isAfter).to.be.greaterThan(0);
  });

  it('does not render a status dot when item.statusDot is absent', async () => {
    const el = await createMenu([{ id: 'files', label: 'Files' }]);
    expect(el.shadowRoot.querySelector('.menu-item-status-dot')).to.be.null;
  });

  it('renders a trailing dot with the supplied color', async () => {
    const el = await createMenu([
      { id: 'publish', label: 'Publish', trailing: { type: 'dot', color: 'rgb(0, 128, 0)' } },
    ]);
    expect(el.shadowRoot.querySelector('.menu-item-status-dot').style.background).to.equal('rgb(0, 128, 0)');
    expect(el.shadowRoot.querySelector('.menu-item-badge')).to.be.null;
  });

  it('renders text and numeric badges, including zero, alongside descriptions', async () => {
    const el = await createMenu([
      { id: 'ideas', label: 'Ideas', description: 'Share suggestions', trailing: { type: 'badge', label: 'New' } },
      { id: 'files', label: 'Files', trailing: { type: 'badge', label: 3 } },
      { id: 'inbox', label: 'Inbox', trailing: { type: 'badge', label: 0 } },
    ]);
    const badges = [...el.shadowRoot.querySelectorAll('.menu-item-badge')];
    expect(badges.map((badge) => badge.textContent)).to.deep.equal(['New', '3', '0']);
    expect(el.shadowRoot.querySelector('.menu-item-description').textContent).to.equal('Share suggestions');
    expect(badges[0].closest('button').textContent).to.include('Ideas');
  });

  it('prefers trailing over statusDot and preserves item selection', async () => {
    const el = await createMenu([
      { id: 'ideas', label: 'Ideas', statusDot: 'green', trailing: { type: 'badge', label: 'New' } },
    ]);
    expect(el.shadowRoot.querySelectorAll('.menu-item-badge')).to.have.length(1);
    expect(el.shadowRoot.querySelector('.menu-item-status-dot')).to.be.null;
    let selected;
    el.addEventListener('select', (event) => { selected = event.detail; });
    el.shadowRoot.querySelector('.menu-item-badge').click();
    expect(selected).to.deep.equal({ id: 'ideas' });
  });

  it('omits empty or unsupported trailing content without falling back to statusDot', async () => {
    const el = await createMenu([
      { id: 'empty', label: 'Empty', trailing: { type: 'badge', label: ' ' } },
      { id: 'missing', label: 'Missing', trailing: { type: 'badge' } },
      { id: 'unknown', label: 'Unknown', statusDot: 'green', trailing: { type: 'icon' } },
      { id: 'none', label: 'None', statusDot: 'green', trailing: null },
    ]);
    expect(el.shadowRoot.querySelector('.menu-item-badge, .menu-item-status-dot')).to.be.null;
  });

  it('replaces and removes trailing content when items change', async () => {
    const el = await createMenu([
      { id: 'publish', label: 'Publish', trailing: { type: 'dot', color: 'green' } },
    ]);
    el.items = [{ id: 'publish', label: 'Publish', trailing: { type: 'badge', label: 'New' } }];
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.menu-item-status-dot')).to.be.null;
    expect(el.shadowRoot.querySelector('.menu-item-badge').textContent).to.equal('New');
    el.items = [{ id: 'publish', label: 'Publish' }];
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.menu-item-badge, .menu-item-status-dot')).to.be.null;
  });
});
