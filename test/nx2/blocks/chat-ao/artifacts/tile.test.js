import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

const FALLBACK = 'Summer Sale Campaign: Active, High Priority, Email, Draft Review.';
const BODY = { id: 'body', component: 'Text', text: 'Campaign metadata', style: 'detail' };

function mount(fields = {}, records = [BODY]) {
  const host = document.createElement('div');
  render(renderUiArtifact({
    textFallback: FALLBACK,
    components: [{ id: 'root', component: 'Tile', child: 'body', ...fields }, ...records],
  }), host);
  return host;
}

describe('artifacts Tile', () => {
  it('renders the sample Tile, metadata and all four supported badges through child IDs', () => {
    const badges = [
      { id: 'b1', component: 'Badge', label: 'Active', variant: 'positive', fillStyle: 'subtle' },
      { id: 'b2', component: 'Badge', label: 'High Priority', variant: 'notice', fillStyle: 'subtle' },
      { id: 'b3', component: 'Badge', label: 'Email', variant: 'informative', fillStyle: 'subtle' },
      { id: 'b4', component: 'Badge', label: 'Draft Review', variant: 'neutral', fillStyle: 'outline' },
    ];
    const title = 'Summer Sale Campaign';
    const description = 'Email campaign targeting active customers with seasonal offers.';
    const metadata = 'Launched June 1 · 42,000 recipients · Email channel';
    const host = mount({ title, description }, [
      { id: 'body', component: 'Column', children: ['metaRow', 'badgeRow'] },
      { id: 'metaRow', component: 'Text', text: metadata, style: 'detail' },
      { id: 'badgeRow', component: 'Row', children: badges.map(({ id }) => id) },
      ...badges,
    ]);
    expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
    expect(host.querySelectorAll('.ui-artifact-tile')).to.have.length(1);
    const tile = host.querySelector('.ui-artifact-tile');
    expect(tile.querySelector('h3').textContent).to.equal(title);
    expect(tile.querySelector('.ui-artifact-tile-description').textContent).to.equal(description);
    expect(tile.querySelector('.ui-artifact-column .ui-artifact-text').textContent).to.equal(metadata);
    expect([...tile.querySelectorAll('.ui-artifact-row .ui-artifact-badge')]
      .map((badge) => badge.textContent)).to.deep.equal(badges.map(({ label }) => label));
  });

  it('allows a child without an optional title or description', () => {
    const host = mount();
    expect(host.querySelector('.ui-artifact-tile-title, .ui-artifact-tile-description')).to.equal(null);
    expect(host.querySelector('.ui-artifact-tile .ui-artifact-text').textContent).to.equal(BODY.text);
  });

  it('renders title and description as literal text rather than HTML or Markdown', () => {
    const text = '<img src=x onerror=alert(1)> **Campaign**';
    const host = mount({ title: text, description: text });
    expect(host.querySelector('img, strong')).to.equal(null);
    expect(host.querySelector('h3').textContent).to.equal(text);
    expect(host.querySelector('.ui-artifact-tile-description').textContent).to.equal(text);
  });

  it('supports a legacy nested child through the same registry', () => {
    const host = document.createElement('div');
    render(renderUiArtifact({
      components: [{
        type: 'Tile',
        props: { title: 'Campaign' },
        children: [{ type: 'Badge', props: { label: 'Active', variant: 'positive' } }],
      }],
    }), host);
    expect(host.querySelector('.ui-artifact-tile h3').textContent).to.equal('Campaign');
    expect(host.querySelector('.ui-artifact-tile .ui-artifact-badge').textContent).to.equal('Active');
  });

  it('hides the whole tile and its child when visible is false', () => {
    const host = mount({ visible: false });
    expect(host.querySelector('.ui-artifact').children).to.have.length(0);
    expect(host.textContent.trim()).to.equal('');
  });

  it('keeps an unsupported child on the normal fallback path', () => {
    const host = mount({}, [{ id: 'body', component: 'Unknown' }]);
    expect(host.querySelector('.ui-artifact-tile .ui-artifact-fallback').textContent)
      .to.equal(FALLBACK);
  });

  [
    { layout: { x: 0, y: 1, w: 4, h: 2 } },
    { grow: true },
    { grow: false, layout: { x: 0, y: 0, w: 2, h: 3 } },
  ].forEach((fields) => {
    it(`renders content while ignoring dashboard placement ${JSON.stringify(fields)}`, () => {
      const host = mount({ title: 'Campaign', ...fields });
      const tile = host.querySelector('.ui-artifact-tile');
      expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
      expect(tile.querySelector('h3').textContent).to.equal('Campaign');
      expect(tile.querySelector('.ui-artifact-text').textContent).to.equal(BODY.text);
      expect(tile.hasAttribute('style')).to.equal(false);
    });
  });

  [
    { title: { path: '/title' } }, { title: 42 }, { description: null },
    { description: { call: 'formatString' } }, { visible: 'false' },
    { visible: { path: '/visible' } }, { child: undefined },
    { children: ['body', 'other'] }, { layout: 'horizontal' }, { grow: 'true' },
    { layout: null }, { layout: [] }, { layout: {} },
    { layout: { x: 0, y: 0, w: 2 } },
    { layout: { x: 0, y: 0, w: Infinity, h: 2 } },
    { layout: { x: 0, y: 0, w: { path: '/width' }, h: 2 } },
    { layout: { x: 0, y: 0, w: 2, h: 2, position: 'fixed' } },
    { grow: { path: '/grow' } },
    { agentActions: [] }, { apiActions: {} }, { writablePaths: ['/draft'] },
    { computed: {} }, { loadOnMount: [] }, { onUnmount: [] }, { watches: [] },
    { onRetry: { call: 'retry' } }, { onRemove: { call: 'remove' } },
  ].forEach((fields) => {
    it(`falls back rather than implying support for ${JSON.stringify(fields)}`, () => {
      const host = mount(fields);
      expect(host.querySelector('.ui-artifact-tile')).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal(FALLBACK);
    });
  });
});
