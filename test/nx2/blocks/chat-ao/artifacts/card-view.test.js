import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

const ITEMS = [
  { id: 'aud-1', title: 'Holiday VIP Shoppers', description: '48,300 profiles · Streaming · Last updated Oct 21' },
  { id: 'aud-2', title: 'Cart Abandoners (7d)', description: '12,750 profiles · Batch · Last updated Oct 22' },
  { id: 'aud-3', title: 'Loyalty Tier – Platinum', description: '6,120 profiles · Edge · Last updated Oct 20' },
];

function mount(fields, textFallback) {
  const host = document.createElement('div');
  render(renderUiArtifact({
    components: [{ id: 'root', component: 'CardView', items: ITEMS, ...fields }],
    textFallback,
  }), host);
  return host;
}

describe('artifacts CardView', () => {
  it('renders the upstream audience collection as three read-only cards', () => {
    const host = mount({ label: 'Active Audiences', size: 'M', selectionMode: 'none' });

    expect(host.querySelector('.ui-artifact-card-view-label').textContent).to.equal('Active Audiences');
    expect(host.querySelector('ul').getAttribute('aria-label')).to.equal('Active Audiences');
    expect(host.querySelectorAll('li.ui-artifact-card-view-item')).to.have.length(3);
    expect([...host.querySelectorAll('.ui-artifact-card-view-title')].map((node) => node.textContent))
      .to.deep.equal(ITEMS.map((item) => item.title));
    expect([...host.querySelectorAll('.ui-artifact-card-view-description')].map((node) => node.textContent))
      .to.deep.equal(ITEMS.map((item) => item.description));
    expect(host.querySelector('button, input, a')).to.equal(null);
    expect(host.querySelector('img')).to.equal(null);
    expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
  });

  it('accepts supported upstream size values without rejecting the collection', () => {
    ['XS', 'S', 'M', 'L', 'XL'].forEach((size) => {
      const host = mount({ size });
      expect(host.querySelectorAll('li')).to.have.length(ITEMS.length);
      expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
    });
  });

  it('defaults to read-only cards with no collection label', () => {
    const host = mount({});
    expect(host.querySelectorAll('li')).to.have.length(ITEMS.length);
    expect(host.querySelector('.ui-artifact-card-view-label')).to.equal(null);
    expect(host.querySelector('ul').hasAttribute('aria-label')).to.be.false;
  });

  it('supports empty collections and optional item descriptions', () => {
    expect(mount({ items: [] }).querySelectorAll('li')).to.have.length(0);
    const host = mount({ items: [{ id: 'a', title: 'Audience' }] });
    expect(host.querySelector('.ui-artifact-card-view-title').textContent).to.equal('Audience');
    expect(host.querySelector('.ui-artifact-card-view-description')).to.equal(null);
  });

  it('escapes labels, titles and descriptions as text', () => {
    const text = '<img src=x onerror=alert(1)>';
    const host = mount({ label: text, items: [{ id: 'a', title: text, description: text }] });
    expect(host.querySelector('img')).to.equal(null);
    expect(host.querySelector('.ui-artifact-card-view-title').textContent).to.equal(text);
    expect(host.querySelector('.ui-artifact-card-view-description').textContent).to.equal(text);
    expect(host.querySelector('.ui-artifact-card-view-label').textContent).to.equal(text);
  });

  it('renders four image cards from the sample payload without losing their text', () => {
    const titles = ['Summer Sale Campaign', 'Loyalty Members Audience', 'Welcome Journey', 'Product Catalog Feed'];
    const items = titles.map((title, index) => ({
      id: String(index + 1),
      title,
      description: `Description for ${title}`,
      imageSrc: `${window.location.origin}/img/icons/s2-icon-image-20-n.svg?sample=${index}`,
    }));
    const host = mount({
      label: 'Sample Items', size: 'M', selectionMode: 'none', items,
    });
    expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
    expect(host.querySelectorAll('li')).to.have.length(4);
    [...host.querySelectorAll('li')].forEach((card, index) => {
      const image = card.querySelector('img');
      expect(image.getAttribute('src')).to.equal(items[index].imageSrc);
      expect(image.getAttribute('alt')).to.equal('');
      expect(image.getAttribute('loading')).to.equal('lazy');
      expect(image.getAttribute('decoding')).to.equal('async');
      expect(image.referrerPolicy).to.equal('no-referrer');
      expect(card.querySelector('h4').textContent).to.equal(items[index].title);
      expect(card.querySelector('p').textContent).to.equal(items[index].description);
    });
  });

  it('supports mixed image and text-only cards', () => {
    const host = mount({
      items: [
        { ...ITEMS[0], imageSrc: `${window.location.origin}/img/icons/s2-icon-image-20-n.svg` },
        ITEMS[1],
      ],
    });
    const cards = host.querySelectorAll('li');
    expect(cards[0].querySelector('img')).not.to.equal(null);
    expect(cards[1].querySelector('img')).to.equal(null);
    expect(cards[1].querySelector('h4').textContent).to.equal(ITEMS[1].title);
  });

  it('removes an old image when a card is updated without imageSrc', () => {
    const host = mount({
      items: [{ ...ITEMS[0], imageSrc: `${window.location.origin}/img/icons/s2-icon-image-20-n.svg` }],
    });
    expect(host.querySelector('img')).not.to.equal(null);
    render(renderUiArtifact({
      components: [{ id: 'root', component: 'CardView', items: [ITEMS[0]] }],
    }), host);
    expect(host.querySelector('img')).to.equal(null);
    expect(host.querySelector('h4').textContent).to.equal(ITEMS[0].title);
  });

  [
    '', null, 42, { path: '/image' }, { call: 'imageUrl' },
    '/relative.png', '//example.com/image.png', 'https://', 'https://[invalid',
    'data:image/svg+xml,<svg/>',
    // eslint-disable-next-line no-script-url -- malicious image-source fixture
    'javascript:alert(1)',
  ].forEach((imageSrc) => {
    it(`uses the artifact fallback for unsupported imageSrc ${JSON.stringify(imageSrc)}`, () => {
      const host = mount({ items: [{ ...ITEMS[0], imageSrc }] }, 'Image cards unavailable.');
      expect(host.querySelector('img, .ui-artifact-card-view')).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent)
        .to.equal('Image cards unavailable.');
    });
  });

  [
    { label: { path: '/label' } },
    { size: 'unknown' },
    { selectionMode: 'single' },
    { selectionMode: 'multiple' },
    { items: undefined },
    { items: { path: '/audiences' } },
    { items: [null] },
    { items: [{ id: '', title: 'Audience' }] },
    { items: [{ id: 'a', title: { path: '/title' } }] },
    { items: [{ id: 'a', title: 'Audience', description: { path: '/description' } }] },
    { items: [{ id: 'a', title: 'Audience', actions: [] }] },
  ].forEach((fields) => {
    it(`uses the artifact fallback for unsupported content ${JSON.stringify(fields)}`, () => {
      const host = mount(fields, 'Active Audiences: three audiences.');
      expect(host.querySelector('.ui-artifact-card-view')).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent)
        .to.equal('Active Audiences: three audiences.');
    });
  });
});
