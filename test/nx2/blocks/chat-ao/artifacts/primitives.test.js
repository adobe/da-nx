import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

const FALLBACK = 'Read the plain-text summary.';

function mount(component, fields) {
  const host = document.createElement('div');
  render(renderUiArtifact({
    components: [{ id: 'root', component, ...fields }],
    textFallback: FALLBACK,
  }), host);
  return host;
}

function expectFallback(component, fields) {
  const host = mount(component, fields);
  expect(host.querySelector('.ui-artifact-fallback')?.textContent).to.equal(FALLBACK);
  expect(host.querySelector('.ui-artifact').children).to.have.length(1);
  return host;
}

describe('artifacts Text', () => {
  it('defaults to a paragraph and preserves literal text rather than parsing markup', () => {
    const text = '<img src=x onerror=alert(1)> **not Markdown**';
    const host = mount('Text', { text });
    expect(host.querySelector('p').textContent).to.equal(text);
    expect(host.querySelector('p').dataset.wrap).to.equal('normal');
    expect(host.querySelector('p').hasAttribute('data-size')).to.equal(false);
    expect(host.querySelector('p').classList.contains('ui-artifact-text-body')).to.equal(true);
    expect(host.querySelector('img, strong')).to.equal(null);
  });

  it('uses semantic defaults for headings, titles and code', () => {
    [['heading', 'h3'], ['title', 'h3'], ['code', 'code'], ['detail', 'p'], ['ui', 'p']]
      .forEach(([style, tag]) => {
        const element = mount('Text', { text: 'Summary', style }).querySelector(tag);
        expect(element.textContent).to.equal('Summary');
        expect(element.classList.contains(`ui-artifact-text-${style}`)).to.equal(true);
      });
  });

  it('honors an explicit semantic element without allowing arbitrary tag names', () => {
    ['p', 'span', 'div', 'label', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach((type) => {
      const host = mount('Text', { text: 'Summary', style: 'heading', type });
      const element = host.querySelector('.ui-artifact-text');
      expect(element.tagName).to.equal(type.toUpperCase());
      expect(element.parentElement).to.equal(host.querySelector('.ui-artifact'));
      expect(element.textContent).to.equal('Summary');
    });
  });

  it('preserves empty text and literal newlines', () => {
    ['', 'First line\nSecond line'].forEach((text) => {
      expect(mount('Text', { text, wrap: 'pre' }).querySelector('p').textContent).to.equal(text);
    });
  });

  it('accepts the declared size and wrap options', () => {
    const options = [
      ...['2xs', 'xs', 'sm', 'lg', 'xl', '2xl', '3xl'].map((size) => ({ size })),
      ...['normal', 'pre', 'truncate'].map((wrap) => ({ wrap })),
    ];
    options.forEach((fields) => {
      const element = mount('Text', { text: 'Summary', ...fields }).querySelector('p');
      expect(element.textContent).to.equal('Summary');
      expect(element.dataset.size).to.equal(fields.size);
      expect(element.dataset.wrap).to.equal(fields.wrap ?? 'normal');
    });
  });

  [
    { text: undefined }, { text: 0 }, { text: { path: '/title' } }, { style: 'unknown' },
    { style: { path: '/style' } }, { type: 'script' }, { type: '__proto__' },
    { type: null }, { type: { path: '/type' } }, { size: 'huge' }, { wrap: 'unknown' },
    { size: { path: '/size' } }, { wrap: { path: '/wrap' } },
  ].forEach((fields) => {
    it(`falls back for unsupported Text content ${JSON.stringify(fields)}`, () => {
      expectFallback('Text', { text: 'Summary', ...fields });
    });
  });
});

describe('artifacts Link', () => {
  const fields = { label: 'Experience League', href: 'https://experienceleague.adobe.com/' };

  it('maps literal label and URL and protects new-tab navigation', () => {
    const anchor = mount('Link', fields).querySelector('a');
    expect(anchor.textContent).to.equal(fields.label);
    expect(anchor.getAttribute('href')).to.equal(fields.href);
    expect(anchor.target).to.equal('_blank');
    expect(anchor.relList.contains('noopener')).to.equal(true);
    expect(anchor.relList.contains('noreferrer')).to.equal(true);
    expect(anchor.dataset.variant).to.equal('primary');
    expect(anchor.dataset.quiet).to.equal('false');
    expect(anchor.dataset.standalone).to.equal('false');
  });

  it('supports explicitly navigating in the current tab', () => {
    const anchor = mount('Link', { ...fields, openInNewTab: false }).querySelector('a');
    expect(anchor.target).to.equal('_self');
    expect(anchor.getAttribute('href')).to.equal(fields.href);
  });

  it('accepts supported variants and literal quiet/standalone flags', () => {
    ['primary', 'secondary'].forEach((variant) => {
      const anchor = mount('Link', {
        ...fields, variant, isQuiet: true, isStandalone: true,
      }).querySelector('a');
      expect(anchor.textContent).to.equal(fields.label);
      expect(anchor.dataset.variant).to.equal(variant);
      expect(anchor.dataset.quiet).to.equal('true');
      expect(anchor.dataset.standalone).to.equal('true');
    });
  });

  it('renders labels as text, not HTML', () => {
    const label = '<img src=x onerror=alert(1)>';
    const host = mount('Link', { ...fields, label });
    expect(host.querySelector('a').textContent).to.equal(label);
    expect(host.querySelector('img')).to.equal(null);
  });

  [
    { href: undefined }, { href: '/relative' }, { href: '//example.com' },
    { href: 'https://' }, { href: 'https://[invalid' }, { href: 'data:text/html,hello' },
    // eslint-disable-next-line no-script-url -- malicious navigation fixture
    { href: 'javascript:alert(1)' },
    { href: { path: '/url' } }, { label: '' }, { label: '  ' },
    { label: { path: '/label' } }, { action: { call: 'sendToChat' } }, { action: null },
    { variant: 'unknown' }, { variant: { path: '/variant' } },
    { isQuiet: 'true' }, { isStandalone: { path: '/standalone' } },
    { openInNewTab: { path: '/newTab' } },
  ].forEach((unsupported) => {
    it(`falls back for unsupported Link content ${JSON.stringify(unsupported)}`, () => {
      const host = expectFallback('Link', { ...fields, ...unsupported });
      expect(host.querySelector('a')).to.equal(null);
    });
  });
});

describe('artifacts Badge', () => {
  it('renders a literal status label safely', () => {
    const label = '<img src=x onerror=alert(1)> Active';
    const host = mount('Badge', { label });
    expect(host.querySelector('.ui-artifact-badge').textContent).to.equal(label);
    expect(host.querySelector('.ui-artifact-badge').classList.contains('ui-artifact-badge-neutral'))
      .to.equal(true);
    expect(host.querySelector('.ui-artifact-badge').dataset.fill).to.equal('bold');
    expect(host.querySelector('.ui-artifact-badge').dataset.size).to.equal('M');
    expect(host.querySelector('img')).to.equal(null);
  });

  it('accepts semantic variants, fill styles and sizes', () => {
    const options = [
      ...['accent', 'informative', 'neutral', 'positive', 'notice', 'negative']
        .map((variant) => ({ variant })),
      ...['bold', 'outline', 'subtle'].map((fillStyle) => ({ fillStyle })),
      ...['S', 'M', 'L', 'XL'].map((size) => ({ size })),
    ];
    options.forEach((fields) => {
      const host = mount('Badge', { label: 'Active', ...fields });
      const badge = host.querySelector('.ui-artifact-badge');
      expect(badge.textContent).to.equal('Active');
      expect(badge.classList.contains(`ui-artifact-badge-${fields.variant ?? 'neutral'}`))
        .to.equal(true);
      expect(badge.dataset.fill).to.equal(fields.fillStyle ?? 'bold');
      expect(badge.dataset.size).to.equal(fields.size ?? 'M');
    });
  });

  [
    { label: undefined }, { label: '' }, { label: '  ' }, { label: { path: '/label' } },
    { variant: 'purple' }, { variant: { path: '/variant' } },
    { fillStyle: 'unknown' }, { fillStyle: { call: 'formatString' } }, { size: 'XS' },
    { size: { path: '/size' } },
  ].forEach((unsupported) => {
    it(`falls back for unsupported Badge content ${JSON.stringify(unsupported)}`, () => {
      expectFallback('Badge', { label: 'Active', ...unsupported });
    });
  });
});

describe('artifact primitive integration', () => {
  const records = [
    { id: 'title', component: 'Text', text: 'Summary', style: 'heading', type: 'h2' },
    { id: 'link', component: 'Link', label: 'Details', href: 'https://example.com/' },
    { id: 'status', component: 'Badge', label: 'Active', variant: 'positive' },
  ];

  it('composes the primitives through flat child references and legacy nested records', () => {
    [
      [{ id: 'root', component: 'Column', children: records.map(({ id }) => id) }, ...records],
      [{
        type: 'Column',
        children: records.map(({ id: _, component, ...props }) => ({ type: component, props })),
      }],
    ].forEach((components) => {
      const host = document.createElement('div');
      render(renderUiArtifact({ components }), host);
      expect(host.querySelectorAll('h2')).to.have.length(1);
      expect(host.querySelector('h2').textContent).to.equal('Summary');
      expect(host.querySelector('a').textContent).to.equal('Details');
      expect(host.querySelectorAll('.ui-artifact-badge')).to.have.length(1);
      expect(host.querySelector('.ui-artifact-badge').textContent).to.equal('Active');
    });
  });

  records.forEach(({ component, ...fields }) => {
    it(`respects literal visibility for ${component} without accepting bindings`, () => {
      const host = mount(component, { ...fields, visible: false });
      expect(host.textContent.trim()).to.equal('');
      expect(host.querySelector('.ui-artifact').children).to.have.length(0);
      [null, 'false', 0, { path: '/visible' }].forEach((visible) => {
        expectFallback(component, { ...fields, visible });
      });
    });
  });

  it('updates options and visibility without leaving stale content or attributes', () => {
    const host = document.createElement('div');
    const update = (components) => render(renderUiArtifact({ components }), host);
    const root = { id: 'root', component: 'Column', children: ['title', 'link', 'status'] };
    update([root, ...records.map((record) => ({ ...record, visible: false }))]);
    expect(host.querySelector('.ui-artifact-column').children).to.have.length(0);

    update([root,
      { ...records[0], text: 'Updated', type: 'span', size: 'xl', wrap: 'pre' },
      { ...records[1], label: 'Updated link', href: 'https://example.com/updated', openInNewTab: false, isQuiet: true },
      { ...records[2], label: 'Draft', variant: 'neutral', fillStyle: 'outline', size: 'S' },
    ]);
    expect(host.querySelector('h2')).to.equal(null);
    expect(host.querySelector('span.ui-artifact-text').textContent).to.equal('Updated');
    expect(host.querySelector('.ui-artifact-text').dataset.size).to.equal('xl');
    expect(host.querySelector('.ui-artifact-text').dataset.wrap).to.equal('pre');
    expect(host.querySelector('a').getAttribute('href')).to.equal('https://example.com/updated');
    expect(host.querySelector('a').target).to.equal('_self');
    expect(host.querySelector('a').dataset.quiet).to.equal('true');
    expect(host.querySelector('.ui-artifact-badge').textContent).to.equal('Draft');
    expect(host.querySelector('.ui-artifact-badge').dataset.fill).to.equal('outline');
    expect(host.querySelector('.ui-artifact-badge').dataset.size).to.equal('S');

    update([root, ...records]);
    expect(host.querySelector('span.ui-artifact-text')).to.equal(null);
    expect(host.querySelector('h2').textContent).to.equal('Summary');
    expect(host.querySelector('h2').hasAttribute('data-size')).to.equal(false);
    expect(host.querySelector('h2').dataset.wrap).to.equal('normal');
    expect(host.querySelector('a').getAttribute('href')).to.equal('https://example.com/');
    expect(host.querySelector('a').target).to.equal('_blank');
    expect(host.querySelector('a').dataset.quiet).to.equal('false');
    expect(host.querySelector('.ui-artifact-badge').textContent).to.equal('Active');
    expect(host.querySelector('.ui-artifact-badge').classList.contains('ui-artifact-badge-positive'))
      .to.equal(true);
    expect(host.querySelector('.ui-artifact-badge').dataset.fill).to.equal('bold');
    expect(host.querySelector('.ui-artifact-badge').dataset.size).to.equal('M');

    update([root, ...records.map((record) => ({ ...record, visible: false }))]);
    expect(host.querySelector('.ui-artifact-column').children).to.have.length(0);
  });
});
