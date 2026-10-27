import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

const SRC = `${window.location.origin}/nx2/img/icons/s2-icon-image-20-n.svg`;
const FALLBACK = 'Image unavailable.';

function artifact(fields = {}) {
  return renderUiArtifact({
    textFallback: FALLBACK,
    components: [{ id: 'root', component: 'Image', src: SRC, ...fields }],
  });
}

function mount(fields) {
  const host = document.createElement('div');
  render(artifact(fields), host);
  return host;
}

describe('artifacts Image', () => {
  it('renders a safe image with literal alt text and lazy private loading', () => {
    const alt = '<img src=x onerror=alert(1)> Preview';
    const host = mount({ alt });
    const image = host.querySelector('.ui-artifact-image');
    expect(image.getAttribute('src')).to.equal(SRC);
    expect(image.getAttribute('alt')).to.equal(alt);
    expect(image.getAttribute('loading')).to.equal('lazy');
    expect(image.getAttribute('decoding')).to.equal('async');
    expect(image.referrerPolicy).to.equal('no-referrer');
    expect(image.style.objectFit).to.equal('contain');
    expect(image.hasAttribute('width')).to.equal(false);
    expect(image.hasAttribute('height')).to.equal(false);
    expect(host.querySelectorAll('img')).to.have.length(1);
    expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
  });

  it('defaults missing alt text to decorative rather than inventing a description', () => {
    expect(mount().querySelector('img').getAttribute('alt')).to.equal('');
  });

  ['contain', 'cover', 'fill', 'none', 'scale-down'].forEach((fit) => {
    it(`renders the literal ${fit} fit mode and pixel dimensions`, () => {
      const image = mount({ fit, width: 320, height: 180 }).querySelector('img');
      expect(image.style.objectFit).to.equal(fit);
      expect(image.getAttribute('width')).to.equal('320');
      expect(image.getAttribute('height')).to.equal('180');
      expect(image.style.width).to.equal('320px');
      expect(image.style.height).to.equal('180px');
    });
  });

  it('supports either dimension independently and removes stale size overrides', () => {
    const host = mount({ width: 240 });
    let image = host.querySelector('img');
    expect(image.style.width).to.equal('240px');
    expect(image.hasAttribute('height')).to.equal(false);
    render(artifact({ height: 120, fit: 'cover' }), host);
    image = host.querySelector('img');
    expect(image.hasAttribute('width')).to.equal(false);
    expect(image.style.width).to.equal('');
    expect(image.style.height).to.equal('120px');
    render(artifact(), host);
    image = host.querySelector('img');
    expect(image.style.width).to.equal('');
    expect(image.style.height).to.equal('');
    expect(image.style.objectFit).to.equal('contain');
  });

  it('supports literal visibility without rendering a placeholder', () => {
    const host = mount({ visible: false });
    expect(host.querySelector('img, .ui-artifact-fallback')).to.equal(null);
    expect(host.textContent.trim()).to.equal('');
  });

  it('composes with Tile and Column through flat child references', () => {
    const host = document.createElement('div');
    render(renderUiArtifact({
      components: [
        { id: 'root', component: 'Tile', child: 'body', layout: { x: 0, y: 0, w: 2, h: 2 } },
        { id: 'body', component: 'Column', children: ['preview', 'caption'], gap: 12 },
        { id: 'preview', component: 'Image', src: SRC, alt: 'Homepage preview' },
        { id: 'caption', component: 'Text', text: 'Homepage' },
      ],
    }), host);
    const column = host.querySelector('.ui-artifact-tile .ui-artifact-column');
    expect(column.querySelector('img').getAttribute('alt')).to.equal('Homepage preview');
    expect(column.querySelector('.ui-artifact-text').textContent).to.equal('Homepage');
    expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
  });

  it('supports legacy nested Image records', () => {
    const host = document.createElement('div');
    render(renderUiArtifact({
      components: [{ type: 'Image', props: { src: SRC, alt: 'Preview', width: 200 } }],
    }), host);
    expect(host.querySelector('img').getAttribute('src')).to.equal(SRC);
    expect(host.querySelector('img').style.width).to.equal('200px');
  });

  [
    { src: undefined }, { src: '' }, { src: null }, { src: 42 },
    { src: '/relative.png' }, { src: '//example.com/image.png' },
    { src: 'https://' }, { src: 'https://[invalid' },
    { src: 'data:image/svg+xml,<svg/>' }, { src: 'blob:https://example.com/image' },
    // eslint-disable-next-line no-script-url -- malicious image-source fixture
    { src: 'javascript:alert(1)' },
    { src: { path: '/image' } }, { src: { call: 'getImage' } },
    { alt: null }, { alt: { path: '/alt' } }, { fit: 'stretch' },
    { fit: { path: '/fit' } }, { width: '100%' }, { height: '100px' },
    { width: 0 }, { width: -1 }, { height: Infinity }, { width: NaN },
    { height: null }, { width: { path: '/width' } },
    { visible: 'false' }, { visible: { path: '/visible' } },
  ].forEach((fields) => {
    it(`falls back for unsafe or unsupported Image fields ${JSON.stringify(fields)}`, () => {
      const host = mount(fields);
      expect(host.querySelector('img')).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal(FALLBACK);
    });
  });
});
