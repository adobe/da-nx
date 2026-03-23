import { expect } from '@esm-bundle/chai';
import {
  getMetadata,
  getLocale,
  setConfig,
  getConfig,
  decorateLink,
  loadBlock,
  loadArea,
} from '../../../../nx/scripts/nx.js';

const BASE_CONFIG = {
  hostnames: ['adobe.com'],
  linkBlocks: [],
  locales: { '': {} },
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
    document.head.querySelectorAll('meta[name="lang"]').forEach((el) => el.remove());
    document.documentElement.removeAttribute('lang');
    localStorage.removeItem('lang');
  });

  afterEach(() => {
    document.head.querySelectorAll('meta[name="lang"]').forEach((el) => el.remove());
    localStorage.removeItem('lang');
  });

  it('returns root locale by default', () => {
    const result = getLocale({ '': {} });
    expect(result.key).to.equal('');
  });

  it('uses the lang meta tag when present', () => {
    const meta = document.createElement('meta');
    meta.name = 'lang';
    meta.content = '/de';
    document.head.append(meta);
    const result = getLocale({ '': {}, '/de': { lang: 'de' } });
    expect(result.key).to.equal('/de');
  });

  it('sets document lang when the locale has a lang property', () => {
    const meta = document.createElement('meta');
    meta.name = 'lang';
    meta.content = '/de';
    document.head.append(meta);
    getLocale({ '': {}, '/de': { lang: 'de' } });
    expect(document.documentElement.lang).to.equal('de');
  });

  it('returns extra locale properties alongside key', () => {
    const meta = document.createElement('meta');
    meta.name = 'lang';
    meta.content = '/de';
    document.head.append(meta);
    const result = getLocale({ '': {}, '/de': { lang: 'de', region: 'DE' } });
    expect(result.region).to.equal('DE');
  });

  it('falls back to localStorage lang', () => {
    localStorage.setItem('lang', '/de');
    const result = getLocale({ '': {}, '/de': { lang: 'de' } });
    expect(result.key).to.equal('/de');
  });
});

// ─── setConfig / getConfig ───────────────────────────────────────────────────

describe('setConfig / getConfig', () => {
  it('returns a config object with provided values', async () => {
    const config = await setConfig({ ...BASE_CONFIG, hostnames: ['example.com'] });
    expect(config.hostnames).to.deep.equal(['example.com']);
  });

  it('defaults linkBlocks to an empty array when not provided', async () => {
    const config = await setConfig({ locales: { '': {} } });
    expect(config.linkBlocks).to.deep.equal([]);
  });

  it('preserves provided linkBlocks', async () => {
    const linkBlocks = [{ video: 'youtube.com' }];
    const config = await setConfig({ ...BASE_CONFIG, linkBlocks });
    expect(config.linkBlocks).to.deep.equal(linkBlocks);
  });

  it('includes a codeBase derived from the module URL', async () => {
    const config = await setConfig(BASE_CONFIG);
    expect(config.codeBase).to.include('/nx');
  });

  it('getConfig returns the last config set by setConfig', async () => {
    await setConfig({ ...BASE_CONFIG, hostnames: ['test.com'] });
    expect(getConfig().hostnames).to.deep.equal(['test.com']);
  });
});

// ─── loadBlock ───────────────────────────────────────────────────────────────

describe('loadBlock', () => {
  before(async () => { await setConfig(BASE_CONFIG); });

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

// ─── decorateHash (via decorateLink) ─────────────────────────────────────────

describe('decorateHash', () => {
  let config;

  before(async () => {
    config = await setConfig({
      ...BASE_CONFIG,
      locales: { '': {}, '/de': { lang: 'de' } },
    });
  });

  afterEach(() => document.body.querySelectorAll('a').forEach((el) => el.remove()));

  it('sets target=_blank and strips the hash for #_blank', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page#_blank';
    document.body.append(a);
    decorateLink(config, a);
    expect(a.target).to.equal('_blank');
    expect(a.href).to.not.include('#_blank');
  });

  it('#_dnt strips the hash from the URL', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page#_dnt';
    document.body.append(a);
    decorateLink(config, a);
    expect(a.href).to.not.include('#_dnt');
  });

  it('#_dnb prevents linkBlock matching and returns null', () => {
    const lbConfig = { ...config, linkBlocks: [{ video: 'youtube.com' }] };
    const a = document.createElement('a');
    a.href = 'https://youtube.com/watch?v=123#_dnb';
    document.body.append(a);
    const result = decorateLink(lbConfig, a);
    expect(result).to.be.null;
    expect(a.classList.contains('video')).to.be.false;
  });
});

// ─── decorateLink ────────────────────────────────────────────────────────────

describe('decorateLink', () => {
  let config;

  before(async () => {
    config = await setConfig(BASE_CONFIG);
  });

  afterEach(() => document.body.querySelectorAll('a, p').forEach((el) => el.remove()));

  it('strips the origin from a hostname-matched link', () => {
    const hostConfig = { ...config, hostnames: ['localhost'] };
    const a = document.createElement('a');
    a.href = 'http://localhost:2000/some/page';
    document.body.append(a);
    decorateLink(hostConfig, a);
    expect(a.getAttribute('href')).to.equal('/some/page');
  });

  it('adds auto-block and pattern class for a matching linkBlock', () => {
    const lbConfig = { ...config, linkBlocks: [{ video: 'youtube.com' }] };
    const a = document.createElement('a');
    a.href = 'https://youtube.com/watch?v=123';
    document.body.append(a);
    const result = decorateLink(lbConfig, a);
    expect(result).to.equal(a);
    expect(a.classList.contains('video')).to.be.true;
    expect(a.classList.contains('auto-block')).to.be.true;
  });

  it('returns null when no linkBlock pattern matches', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    document.body.append(a);
    expect(decorateLink(config, a)).to.be.null;
  });

  it('returns null and logs when the href is invalid', () => {
    const errors = [];
    const logConfig = { ...config, log: (...args) => errors.push(args) };
    const a = document.createElement('a');
    a.href = 'not a valid url';
    a.getAttribute = () => 'not a valid url';
    document.body.append(a);
    const result = decorateLink(logConfig, a);
    expect(result).to.be.null;
  });
});

// ─── loadArea ────────────────────────────────────────────────────────────────

describe('loadArea', () => {
  let area;

  before(async () => { await setConfig(BASE_CONFIG); });

  beforeEach(() => {
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
    await setConfig({ ...BASE_CONFIG, linkBlocks: [{ video: 'youtube.com' }] });
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
    await setConfig(BASE_CONFIG);
    const section = document.createElement('div');
    area.append(section);
    await loadArea({ area });
    expect(section.dataset.status).to.be.undefined;
  });
});

// ─── decorateDoc (via loadArea with document) ────────────────────────────────

describe('decorateDoc', () => {
  before(async () => { await setConfig(BASE_CONFIG); });

  afterEach(() => {
    document.body.classList.remove('dark', 'light');
    document.head.querySelectorAll('meta[name="header"]').forEach((el) => el.remove());
    localStorage.removeItem('color-scheme');
    localStorage.removeItem('lazyhash');
  });

  it('applies a color scheme class from localStorage', async () => {
    localStorage.setItem('color-scheme', 'dark');
    await loadArea();
    expect(document.body.classList.contains('dark')).to.be.true;
  });

  it('removes the header element when header meta is "off"', async () => {
    const meta = document.createElement('meta');
    meta.name = 'header';
    meta.content = 'off';
    document.head.append(meta);
    const header = document.createElement('header');
    document.body.prepend(header);
    await loadArea();
    expect(document.querySelector('header')).to.be.null;
  });
});
