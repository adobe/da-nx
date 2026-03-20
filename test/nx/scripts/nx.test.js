import { expect } from '@esm-bundle/chai';
import {
  getMetadata,
  getLocale,
  decorateLink,
  setConfig,
  getConfig,
  loadBlock,
  loadArea,
} from '../../../nx/scripts/nx.js';

const BASE_CONFIG = {
  hostnames: ['adobe.com'],
  linkBlocks: [],
  locales: { '': {}, '/de': { lang: 'de' } },
  locale: { prefix: '' },
  log: () => {},
};

// ─── getMetadata ─────────────────────────────────────────────────────────────

describe('getMetadata', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name], meta[property]').forEach((el) => el.remove());
  });

  it('returns content for a name-based meta tag', () => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = 'Test description';
    document.head.append(meta);
    expect(getMetadata('description')).to.equal('Test description');
  });

  it('returns content for a property-based meta tag', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:title');
    meta.content = 'OG Title';
    document.head.append(meta);
    expect(getMetadata('og:title')).to.equal('OG Title');
  });

  it('returns null when the meta tag does not exist', () => {
    expect(getMetadata('nonexistent')).to.be.null;
  });
});

// ─── getLocale ───────────────────────────────────────────────────────────────

describe('getLocale', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name="locale"]').forEach((el) => el.remove());
    document.documentElement.removeAttribute('lang');
  });

  afterEach(() => {
    document.head.querySelectorAll('meta[name="locale"]').forEach((el) => el.remove());
  });

  it('returns root locale by default', () => {
    const result = getLocale({ '': {} });
    expect(result.prefix).to.equal('');
  });

  it('uses the locale meta tag when present', () => {
    const meta = document.createElement('meta');
    meta.name = 'locale';
    meta.content = '/de';
    document.head.append(meta);
    const result = getLocale({ '': {}, '/de': { lang: 'de' } });
    expect(result.prefix).to.equal('/de');
  });

  it('sets document lang when the locale has a lang property', () => {
    const meta = document.createElement('meta');
    meta.name = 'locale';
    meta.content = '/de';
    document.head.append(meta);
    getLocale({ '': {}, '/de': { lang: 'de' } });
    expect(document.documentElement.lang).to.equal('de');
  });

  it('returns extra locale properties alongside prefix', () => {
    const meta = document.createElement('meta');
    meta.name = 'locale';
    meta.content = '/de';
    document.head.append(meta);
    const result = getLocale({ '': {}, '/de': { lang: 'de', region: 'DE' } });
    expect(result.region).to.equal('DE');
  });
});

// ─── setConfig / getConfig ───────────────────────────────────────────────────

describe('setConfig / getConfig', () => {
  it('returns a config object with provided values', () => {
    const config = setConfig({ ...BASE_CONFIG, hostnames: ['example.com'] });
    expect(config.hostnames).to.deep.equal(['example.com']);
  });

  it('defaults linkBlocks to an empty array when not provided', () => {
    const config = setConfig({});
    expect(config.linkBlocks).to.deep.equal([]);
  });

  it('preserves provided linkBlocks', () => {
    const linkBlocks = [{ video: 'youtube.com' }];
    const config = setConfig({ ...BASE_CONFIG, linkBlocks });
    expect(config.linkBlocks).to.deep.equal(linkBlocks);
  });

  it('includes a codeBase derived from the module URL', () => {
    const config = setConfig(BASE_CONFIG);
    expect(config.codeBase).to.include('/nx');
  });

  it('getConfig returns the last config set by setConfig', () => {
    setConfig({ ...BASE_CONFIG, hostnames: ['test.com'] });
    expect(getConfig().hostnames).to.deep.equal(['test.com']);
  });

  it('getConfig returns an object with defaults when no config has been set', () => {
    const config = getConfig();
    expect(config).to.be.an('object');
    expect(config.linkBlocks).to.be.an('array');
  });
});

// ─── loadBlock ───────────────────────────────────────────────────────────────

describe('loadBlock', () => {
  before(() => setConfig(BASE_CONFIG));

  it('sets blockName on the dataset', async () => {
    const block = document.createElement('div');
    block.className = 'my-block';
    const result = await loadBlock(block);
    expect(result.dataset.blockName).to.equal('my-block');
  });

  it('returns the block element even when the module import fails', async () => {
    const block = document.createElement('div');
    block.className = 'nonexistent-block';
    const result = await loadBlock(block);
    expect(result).to.equal(block);
  });

  it('uses the first class name as the block name', async () => {
    const block = document.createElement('div');
    block.className = 'first-name second-name';
    await loadBlock(block);
    expect(block.dataset.blockName).to.equal('first-name');
  });
});

// ─── decorateButton (via decorateLink) ───────────────────────────────────────

describe('decorateButton', () => {
  let container;

  beforeEach(() => {
    setConfig(BASE_CONFIG);
    container = document.createElement('p');
    document.body.append(container);
  });

  afterEach(() => container.remove());

  function makeWrappedLink(tagName) {
    const wrapper = document.createElement(tagName);
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    wrapper.append(a);
    container.append(wrapper);
    return a;
  }

  it('adds btn-secondary for a link inside <em>', () => {
    const a = makeWrappedLink('em');
    decorateLink(BASE_CONFIG, a);
    expect(a.classList.contains('btn')).to.be.true;
    expect(a.classList.contains('btn-secondary')).to.be.true;
  });

  it('adds btn-primary for a link inside <strong>', () => {
    const a = makeWrappedLink('strong');
    decorateLink(BASE_CONFIG, a);
    expect(a.classList.contains('btn-primary')).to.be.true;
  });

  it('adds btn-accent for a link inside <em><strong>', () => {
    const em = document.createElement('em');
    const strong = document.createElement('strong');
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    strong.append(a);
    em.append(strong);
    container.append(em);
    decorateLink(BASE_CONFIG, a);
    expect(a.classList.contains('btn-accent')).to.be.true;
  });

  it('adds btn-negative for a link inside <del>', () => {
    const a = makeWrappedLink('del');
    decorateLink(BASE_CONFIG, a);
    expect(a.classList.contains('btn-negative')).to.be.true;
  });

  it('adds btn-outline for a link containing <u>', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    const u = document.createElement('u');
    u.textContent = 'underlined';
    a.append(u);
    container.append(a);
    decorateLink(BASE_CONFIG, a);
    expect(a.classList.contains('btn-outline')).to.be.true;
  });

  it('adds btn-group when multiple button wrappers are siblings', () => {
    const em1 = document.createElement('em');
    const a1 = document.createElement('a');
    a1.href = 'https://example.com/page1';
    em1.append(a1);
    const em2 = document.createElement('em');
    const a2 = document.createElement('a');
    a2.href = 'https://example.com/page2';
    em2.append(a2);
    container.append(em1, em2);
    decorateLink(BASE_CONFIG, a1);
    expect(container.classList.contains('btn-group')).to.be.true;
  });

  it('does not decorate when the link has non-empty text siblings', () => {
    const em = document.createElement('em');
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    em.append(a);
    container.append(em, document.createTextNode('some surrounding text'));
    decorateLink(BASE_CONFIG, a);
    expect(a.classList.contains('btn')).to.be.false;
  });

  it('does not decorate a plain link with no wrappers or <u>', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    container.append(a);
    decorateLink(BASE_CONFIG, a);
    expect(a.classList.contains('btn')).to.be.false;
  });
});

// ─── decorateHash (via decorateLink) ─────────────────────────────────────────

describe('decorateHash', () => {
  const deConfig = setConfig({
    ...BASE_CONFIG,
    locales: { '': {}, '/de': { lang: 'de' } },
    locale: { prefix: '/de' },
  });

  afterEach(() => document.body.querySelectorAll('a').forEach((el) => el.remove()));

  it('sets target=_blank and strips the hash for #_blank', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page#_blank';
    document.body.append(a);
    decorateLink(deConfig, a);
    expect(a.target).to.equal('_blank');
    expect(a.href).to.not.include('#_blank');
  });

  it('#_dnt prevents localization', () => {
    const a = document.createElement('a');
    a.href = '/page#_dnt';
    document.body.append(a);
    decorateLink(deConfig, a);
    expect(a.getAttribute('href')).to.not.include('/de/');
  });

  it('#_dnb prevents linkBlock matching and returns null', () => {
    const config = { ...BASE_CONFIG, linkBlocks: [{ video: 'youtube.com' }] };
    const a = document.createElement('a');
    a.href = 'https://youtube.com/watch?v=123#_dnb';
    document.body.append(a);
    const result = decorateLink(config, a);
    expect(result).to.be.null;
    expect(a.classList.contains('video')).to.be.false;
  });
});

// ─── decorateLink ─────────────────────────────────────────────────────────────

describe('decorateLink', () => {
  afterEach(() => document.body.querySelectorAll('a, p').forEach((el) => el.remove()));

  it('strips the origin from a hostname-matched link', () => {
    const config = { ...BASE_CONFIG, hostnames: ['localhost'] };
    const a = document.createElement('a');
    a.href = 'http://localhost:2000/some/page';
    document.body.append(a);
    decorateLink(config, a);
    expect(a.getAttribute('href')).to.equal('/some/page');
  });

  it('adds auto-block and pattern class for a matching linkBlock', () => {
    const config = { ...BASE_CONFIG, linkBlocks: [{ video: 'youtube.com' }] };
    const a = document.createElement('a');
    a.href = 'https://youtube.com/watch?v=123';
    document.body.append(a);
    const result = decorateLink(config, a);
    expect(result).to.equal(a);
    expect(a.classList.contains('video')).to.be.true;
    expect(a.classList.contains('auto-block')).to.be.true;
  });

  it('returns null when no linkBlock pattern matches', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    document.body.append(a);
    expect(decorateLink(BASE_CONFIG, a)).to.be.null;
  });

  it('returns null and logs when the href is invalid', () => {
    const errors = [];
    const config = { ...BASE_CONFIG, log: (msg) => errors.push(msg) };
    const a = document.createElement('a');
    a.href = 'not a valid url';
    // Force an invalid href by overriding getAttribute
    a.getAttribute = () => 'not a valid url';
    document.body.append(a);
    const result = decorateLink(config, a);
    expect(result).to.be.null;
  });
});

// ─── loadArea ────────────────────────────────────────────────────────────────

describe('loadArea', () => {
  let area;

  beforeEach(() => {
    setConfig(BASE_CONFIG);
    area = document.createElement('div');
    document.body.append(area);
  });

  afterEach(() => area.remove());

  it('adds .section class to each top-level div', async () => {
    const section = document.createElement('div');
    area.append(section);
    await loadArea({ area });
    expect(section.classList.contains('section')).to.be.true;
  });

  it('wraps non-div children in a .default-content div', async () => {
    const section = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = 'text';
    section.append(p);
    area.append(section);
    await loadArea({ area });
    const wrapper = section.querySelector('.default-content');
    expect(wrapper).to.exist;
    expect(wrapper.contains(p)).to.be.true;
  });

  it('wraps div children in a .block-content div', async () => {
    const section = document.createElement('div');
    const block = document.createElement('div');
    block.className = 'some-block';
    section.append(block);
    area.append(section);
    await loadArea({ area });
    expect(section.querySelector('.block-content')).to.exist;
  });

  it('groups consecutive same-type children together', async () => {
    const section = document.createElement('div');
    section.innerHTML = '<p>text</p><p>text2</p><div class="b"></div>';
    area.append(section);
    await loadArea({ area });
    expect(section.querySelectorAll('.default-content').length).to.equal(1);
    expect(section.querySelectorAll('.block-content').length).to.equal(1);
  });

  it('prepends a high-res source to picture elements', async () => {
    const section = document.createElement('div');
    const pic = document.createElement('picture');
    const source = document.createElement('source');
    source.setAttribute('srcset', '/img/photo.jpg?width=750&quality=80');
    pic.append(source);
    section.append(pic);
    area.append(section);
    await loadArea({ area });
    const sources = pic.querySelectorAll('source');
    expect(sources[0].getAttribute('media')).to.equal('(min-width: 1440px)');
    expect(sources[0].getAttribute('srcset')).to.include('width=3000');
  });

  it('identifies and loads linkBlock auto-blocks', async () => {
    setConfig({ ...BASE_CONFIG, linkBlocks: [{ video: 'youtube.com' }] });
    const section = document.createElement('div');
    const p = document.createElement('p');
    const a = document.createElement('a');
    a.href = 'https://youtube.com/watch?v=abc';
    p.append(a);
    section.append(p);
    area.append(section);
    await loadArea({ area });
    expect(a.classList.contains('video')).to.be.true;
  });

  it('removes section data-status after loading', async () => {
    const section = document.createElement('div');
    area.append(section);
    await loadArea({ area });
    expect(section.dataset.status).to.be.undefined;
  });
});

// ─── decorateDoc (via loadArea with document) ────────────────────────────────

describe('decorateDoc', () => {
  let addedHeader;

  afterEach(() => {
    addedHeader?.remove();
    addedHeader = null;
    document.body.classList.remove('dark', 'light', 'no-header');
    document.head.querySelectorAll('meta[name="header"]').forEach((el) => el.remove());
    localStorage.removeItem('color-scheme');
    localStorage.removeItem('lazyhash');
  });

  it('applies a color scheme class from localStorage', async () => {
    localStorage.setItem('color-scheme', 'dark');
    await loadArea();
    expect(document.body.classList.contains('dark')).to.be.true;
  });

  it('sets header className from the header meta tag', async () => {
    const meta = document.createElement('meta');
    meta.name = 'header';
    meta.content = 'dark-nav';
    document.head.append(meta);
    addedHeader = document.createElement('header');
    document.body.prepend(addedHeader);
    await loadArea();
    expect(addedHeader.className).to.equal('dark-nav');
  });

  it('removes the header element and adds no-header class when meta is "off"', async () => {
    const meta = document.createElement('meta');
    meta.name = 'header';
    meta.content = 'off';
    document.head.append(meta);
    addedHeader = document.createElement('header');
    document.body.prepend(addedHeader);
    await loadArea();
    expect(document.querySelector('header')).to.be.null;
    expect(document.body.classList.contains('no-header')).to.be.true;
    addedHeader = null;
  });
});
