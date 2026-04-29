import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  getColorScheme,
  getMetadata,
  getLocale,
  env,
  setConfig,
  getConfig,
  loc,
  loadBlock,
  decorateLink,
  loadArea,
} from '../../../../scripts/nx.js';

// ─── getColorScheme ─────────────────────────────────────────────────────────

describe('getColorScheme', () => {
  let originalMatchMedia;

  beforeEach(() => {
    localStorage.clear();
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    localStorage.clear();
  });

  it('returns stored color-scheme from localStorage if present', () => {
    localStorage.setItem('color-scheme', 'dark-scheme');
    expect(getColorScheme()).to.equal('dark-scheme');
  });

  it('returns dark-scheme when matchMedia prefers dark', () => {
    localStorage.removeItem('color-scheme');
    window.matchMedia = sinon.stub().returns({ matches: true });
    expect(getColorScheme()).to.equal('dark-scheme');
  });

  it('returns light-scheme when matchMedia does not prefer dark', () => {
    localStorage.removeItem('color-scheme');
    window.matchMedia = sinon.stub().returns({ matches: false });
    expect(getColorScheme()).to.equal('light-scheme');
  });

  it('prioritizes localStorage over matchMedia', () => {
    localStorage.setItem('color-scheme', 'light-scheme');
    window.matchMedia = sinon.stub().returns({ matches: true });
    expect(getColorScheme()).to.equal('light-scheme');
  });
});

// ─── getMetadata ────────────────────────────────────────────────────────────

describe('getMetadata', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('returns content for name attribute', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'Test description');
    document.head.appendChild(meta);

    expect(getMetadata('description')).to.equal('Test description');
  });

  it('returns content for property attribute when name includes colon', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:title');
    meta.setAttribute('content', 'Open Graph Title');
    document.head.appendChild(meta);

    expect(getMetadata('og:title')).to.equal('Open Graph Title');
  });

  it('returns null when meta tag not found', () => {
    expect(getMetadata('nonexistent')).to.be.null;
  });

  it('returns null when name is falsy', () => {
    expect(getMetadata('')).to.be.null;
    expect(getMetadata(null)).to.be.null;
  });
});

// ─── getLocale ──────────────────────────────────────────────────────────────

describe('getLocale', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    document.head.innerHTML = '';
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('returns default locale when no meta or localStorage', () => {
    const locales = { '': { lang: 'en', prefix: '/en' }, fr: { lang: 'fr', prefix: '/fr' } };
    const result = getLocale(locales);
    expect(result.key).to.equal('');
  });

  it('uses lang from metadata when present', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'lang');
    meta.setAttribute('content', 'fr');
    document.head.appendChild(meta);

    const locales = { '': { lang: 'en' }, fr: { lang: 'fr', prefix: '/fr' } };
    const result = getLocale(locales);
    expect(result.key).to.equal('fr');
    expect(result.lang).to.equal('fr');
    expect(result.prefix).to.equal('/fr');
    expect(document.documentElement.lang).to.equal('fr');
  });

  it('uses lang from localStorage when no metadata', () => {
    localStorage.setItem('lang', 'de');
    const locales = { '': { lang: 'en' }, de: { lang: 'de', prefix: '/de' } };
    const result = getLocale(locales);
    expect(result.key).to.equal('de');
  });

  it('does not set documentElement.lang when locale has no lang property', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'lang');
    meta.setAttribute('content', 'unknown');
    document.head.appendChild(meta);

    const locales = { '': { lang: 'en' } };
    getLocale(locales);
    expect(document.documentElement.lang).to.equal('');
  });
});

// ─── env ────────────────────────────────────────────────────────────────────

describe('env', () => {
  it('is a string', () => {
    expect(env).to.be.a('string');
  });

  it('is one of prod, stage, or dev', () => {
    expect(['prod', 'stage', 'dev']).to.include(env);
  });

  // Note: Since env is computed at module load time based on window.location.host,
  // we can't easily test all branches without reloading the module in different contexts.
  // The test environment (localhost) will typically result in 'dev'.
});

// ─── setConfig / getConfig ──────────────────────────────────────────────────

describe('setConfig / getConfig', () => {
  const originalFetch = window.fetch;
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub();
    window.fetch = fetchStub;
    localStorage.clear();
    document.head.innerHTML = '';
  });

  afterEach(() => {
    window.fetch = originalFetch;
    localStorage.clear();
    document.head.innerHTML = '';
  });

  it('getConfig returns error object when config not set', () => {
    const config = getConfig();
    expect(config).to.have.property('error');
    expect(config.error).to.include('not set');
  });

  it('setConfig returns a config object with defaults', async () => {
    const config = await setConfig();
    expect(config).to.have.property('env');
    expect(config).to.have.property('iconSize', '20');
    expect(config).to.have.property('linkBlocks');
    expect(config.linkBlocks).to.deep.equal([{ fragment: '/fragments/' }]);
    expect(config).to.have.property('providers');
    expect(config).to.have.property('codeBase');
    expect(config).to.have.property('nxBase');
    expect(config).to.have.property('log');
    expect(config).to.have.property('locales');
    expect(config).to.have.property('locale');
    expect(config).to.have.property('strings');
  });

  it('setConfig merges provided config with defaults', async () => {
    const customLog = sinon.stub();
    const config = await setConfig({
      iconSize: '32',
      log: customLog,
      myCustomProp: 'test',
    });
    expect(config.iconSize).to.equal('32');
    expect(config.log).to.equal(customLog);
    expect(config.myCustomProp).to.equal('test');
  });

  it('getConfig returns set config after setConfig', async () => {
    await setConfig({ test: 'value' });
    const config = getConfig();
    expect(config.test).to.equal('value');
    expect(config).to.not.have.property('error');
  });

  it('setConfig loads localized strings for non-default locale', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'lang');
    meta.setAttribute('content', 'fr');
    document.head.appendChild(meta);

    fetchStub.resolves({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { key: 'hello', value: 'bonjour' },
          { key: 'goodbye', value: 'au revoir' },
        ],
      }),
    });

    const locales = { '': { lang: 'en' }, fr: { lang: 'fr' } };
    const config = await setConfig({ locales });

    expect(fetchStub.calledOnce).to.be.true;
    expect(fetchStub.firstCall.args[0]).to.equal('/fr/placeholders.json');
    expect(config.strings.get('hello')).to.equal('bonjour');
    expect(config.strings.get('goodbye')).to.equal('au revoir');
  });

  it('setConfig handles fetch failure for strings gracefully', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'lang');
    meta.setAttribute('content', 'fr');
    document.head.appendChild(meta);

    fetchStub.rejects(new Error('Network error'));

    const logStub = sinon.stub();
    const locales = { '': { lang: 'en' }, fr: { lang: 'fr' } };
    const config = await setConfig({ locales, log: logStub });

    expect(config.strings.size).to.equal(0);
    expect(logStub.calledOnce).to.be.true;
    expect(logStub.firstCall.args[0]).to.include('Could not load strings');
  });

  it('setConfig skips loading strings for default locale', async () => {
    const locales = { '': { lang: 'en' }, fr: { lang: 'fr' } };
    await setConfig({ locales });
    expect(fetchStub.called).to.be.false;
  });

  it('setConfig derives nxBase from import.meta.url', async () => {
    const config = await setConfig();
    expect(config.nxBase).to.be.a('string');
    expect(config.nxBase).to.not.include('/scripts/nx.js');
  });
});

// ─── loc ────────────────────────────────────────────────────────────────────

describe('loc', () => {
  it('returns localized string when key exists', async () => {
    await setConfig({ locales: { '': {} } });
    // Manually add strings after config is set (since setConfig overwrites strings)
    const config = getConfig();
    config.strings.set('test-welcome-key', 'Welcome Message!');
    config.strings.set('test-logout-key', 'Sign out');

    const result = loc`test-welcome-key`;
    expect(result).to.equal('Welcome Message!');
  });

  it('returns key when localized string not found', async () => {
    await setConfig({ locales: { '': {} } });
    expect(loc`totally-unknown-key-xyz`).to.equal('totally-unknown-key-xyz');
  });

  it('supports value-based usage', async () => {
    await setConfig({ locales: { '': {} } });
    const config = getConfig();
    config.strings.set('test-value-key', 'Value Message!');

    const key = 'test-value-key';
    const result = loc`${key}`;
    expect(result).to.equal('Value Message!');
  });
});

// ─── loadBlock ──────────────────────────────────────────────────────────────

describe('loadBlock', () => {
  beforeEach(async () => {
    await setConfig({
      providers: { custom: 'https://example.com' },
      nxBase: '/nx2',
      log: sinon.stub(),
    });
  });

  it('loads block from nxBase when no provider match', async () => {
    const block = document.createElement('div');
    block.classList.add('myblock');

    // Since we can't easily mock dynamic imports, we'll test what we can
    // The block should have dataset.blockName set even if import fails
    try {
      await loadBlock(block);
    } catch {
      // Expected to fail in test environment
    }

    expect(block.dataset.blockName).to.equal('myblock');
  });

  it('sets dataset.blockName for provider-prefixed blocks', async () => {
    const block = document.createElement('div');
    block.classList.add('custom-widget');

    try {
      await loadBlock(block);
    } catch {
      // Expected to fail in test environment
    }

    expect(block.dataset.blockName).to.equal('custom-widget');
  });

  it('calls log on error', async () => {
    const config = getConfig();
    const block = document.createElement('div');
    block.classList.add('nonexistent');

    await loadBlock(block);
    expect(config.log.called).to.be.true;
  });

  it('returns the block element', async () => {
    const block = document.createElement('div');
    block.classList.add('test');
    const result = await loadBlock(block);
    expect(result).to.equal(block);
  });
});

// ─── decorateLink ───────────────────────────────────────────────────────────

describe('decorateLink', () => {
  let config;

  beforeEach(async () => {
    config = await setConfig({
      hostnames: ['example.com', 'www.example.com'],
      linkBlocks: [
        { fragment: '/fragments/' },
        { dialog: '/dialogs/' },
      ],
      log: sinon.stub(),
    });
  });

  it('strips origin from internal links', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/path/page';
    decorateLink(config, a);
    expect(a.href).to.not.include('https://example.com');
    expect(a.href).to.include('/path/page');
  });

  it('does not modify external links', () => {
    const a = document.createElement('a');
    a.href = 'https://external.com/path';
    const originalHref = a.href;
    decorateLink(config, a);
    expect(a.href).to.equal(originalHref);
  });

  it('adds _blank target when hash contains #_blank', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page#_blank';
    decorateLink(config, a);
    expect(a.target).to.equal('_blank');
    expect(a.href).to.not.include('#_blank');
  });

  it('adds fragment auto-block class for fragment paths', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/fragments/header';
    const result = decorateLink(config, a);
    expect(a.classList.contains('fragment')).to.be.true;
    expect(a.classList.contains('auto-block')).to.be.true;
    expect(result).to.equal(a);
  });

  it('adds dialog auto-block class for fragment with hash', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/fragments/modal#dialog';
    const result = decorateLink(config, a);
    expect(a.classList.contains('dialog')).to.be.true;
    expect(a.classList.contains('auto-block')).to.be.true;
    expect(result).to.equal(a);
  });

  it('returns null when #_dnb hash is present', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page#_dnb';
    const result = decorateLink(config, a);
    expect(result).to.be.null;
  });

  it('returns null when no pattern matches', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/normal/page';
    const result = decorateLink(config, a);
    expect(result).to.be.null;
  });

  it('handles invalid URLs gracefully', () => {
    const logStub = sinon.stub();
    const testConfig = { ...config, log: logStub };
    const a = document.createElement('a');
    // Use an href that will throw when creating URL object
    Object.defineProperty(a, 'href', {
      get: () => { throw new Error('Invalid URL'); },
      configurable: true,
    });
    const result = decorateLink(testConfig, a);
    expect(logStub.called).to.be.true;
    expect(result).to.be.null;
  });

  it('removes hash modifiers from href', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page#_blank#_dnt';
    decorateLink(config, a);
    expect(a.href).to.not.include('#_blank');
    expect(a.href).to.not.include('#_dnt');
  });
});

// ─── loadArea ───────────────────────────────────────────────────────────────

describe('loadArea', () => {
  beforeEach(async () => {
    await setConfig({
      hostnames: ['example.com'],
      linkBlocks: [{ fragment: '/fragments/' }],
      log: sinon.stub(),
      locales: { '': { lang: 'en' } },
    });
    document.body.innerHTML = '';
    document.body.className = '';
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    sessionStorage.clear();
    localStorage.clear();
  });

  it('decorates sections in the provided area', async () => {
    // Add header and app-frame class to prevent early return in loadArea
    document.body.classList.add('app-frame');
    const header = document.createElement('header');
    const nxNav = document.createElement('nx-nav');
    header.appendChild(nxNav);
    document.body.appendChild(header);

    const main = document.createElement('main');
    main.innerHTML = `
      <div>
        <h1>Section 1</h1>
        <p>Content</p>
      </div>
      <div>
        <h2>Section 2</h2>
      </div>
    `;
    document.body.appendChild(main);

    await loadArea({ area: document });

    const sections = document.querySelectorAll('.section');
    expect(sections.length).to.equal(2);
    sections.forEach((section) => {
      expect(section.dataset.status).to.be.undefined;
    });
  });

  it('groups block-content and default-content', async () => {
    const main = document.createElement('main');
    main.innerHTML = `
      <div>
        <h1>Text</h1>
        <p>More text</p>
        <div class="block">Block content</div>
        <span>After block</span>
      </div>
    `;
    document.body.appendChild(main);

    await loadArea({ area: document });

    const section = document.querySelector('.section');
    const defaultContent = section.querySelector('.default-content');
    const blockContent = section.querySelector('.block-content');

    expect(defaultContent).to.not.be.null;
    expect(blockContent).to.not.be.null;
    expect(defaultContent.children.length).to.be.greaterThan(0);
  });

  it('decorates links and identifies auto-blocks', async () => {
    const main = document.createElement('main');
    main.innerHTML = `
      <div>
        <p><a href="https://example.com/fragments/test">Fragment link</a></p>
      </div>
    `;
    document.body.appendChild(main);

    await loadArea({ area: document });

    const link = document.querySelector('a');
    expect(link.classList.contains('fragment')).to.be.true;
    expect(link.classList.contains('auto-block')).to.be.true;
  });

  it('replaces placeholders with localized strings', async () => {
    await setConfig({
      hostnames: ['example.com'],
      linkBlocks: [{ fragment: '/fragments/' }],
      locales: { '': { lang: 'en' } },
      log: sinon.stub(),
    });

    // Add strings after config is set (since setConfig overwrites strings)
    const config = getConfig();
    config.strings.set('test-unique-greeting', 'Hello Unique World');

    document.body.classList.add('app-frame');
    const header = document.createElement('header');
    const nxNav = document.createElement('nx-nav');
    header.appendChild(nxNav);
    document.body.appendChild(header);

    const main = document.createElement('main');
    main.innerHTML = '<div><p>Welcome: {test-unique-greeting}</p></div>';
    document.body.appendChild(main);

    await loadArea({ area: document });

    const text = document.querySelector('p').textContent;
    expect(text).to.equal('Welcome: Hello Unique World');
  });

  it('sets session flag when sessionStorage has session', async () => {
    sessionStorage.setItem('session', 'true');
    const main = document.createElement('main');
    main.innerHTML = '<div><h1>Test</h1></div>';
    document.body.appendChild(main);

    await loadArea({ area: document });

    expect(document.body.classList.contains('session')).to.be.true;
  });

  it('does not set session for non-document areas', async () => {
    sessionStorage.setItem('session', 'true');
    const fragment = document.createElement('div');
    fragment.innerHTML = '<div><h1>Test</h1></div>';

    await loadArea({ area: fragment });

    expect(document.body.classList.contains('session')).to.be.false;
  });

  it('calls decorateArea hook if provided in config', async () => {
    const decorateAreaStub = sinon.stub();
    await setConfig({
      decorateArea: decorateAreaStub,
      locales: { '': { lang: 'en' } },
      log: sinon.stub(),
    });

    const main = document.createElement('main');
    main.innerHTML = '<div><h1>Test</h1></div>';
    document.body.appendChild(main);

    await loadArea({ area: document });

    expect(decorateAreaStub.calledOnce).to.be.true;
    expect(decorateAreaStub.firstCall.args[0]).to.have.property('area', document);
  });

  it('processes sections with blocks', async () => {
    const main = document.createElement('main');
    main.innerHTML = `
      <div>
        <div class="testblock">
          <div>Block content</div>
        </div>
      </div>
    `;
    document.body.appendChild(main);

    await loadArea({ area: document });

    const section = document.querySelector('.section');
    expect(section.blocks).to.be.an('array');
  });

  it('handles areas without main element', async () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <div>
        <h1>Fragment Section</h1>
      </div>
    `;

    await loadArea({ area: fragment });

    const section = fragment.querySelector('.section');
    expect(section).to.not.be.null;
  });
});

// ─── Integration tests ──────────────────────────────────────────────────────

describe('Integration: config and localization', () => {
  const originalFetch = window.fetch;

  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '';
    window.fetch = sinon.stub();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    localStorage.clear();
    document.head.innerHTML = '';
  });

  it('full flow: setConfig with locale, then use loc function', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'lang');
    meta.setAttribute('content', 'es');
    document.head.appendChild(meta);

    window.fetch.resolves({
      ok: true,
      json: () => Promise.resolve({
        data: [{ key: 'welcome', value: 'Bienvenido' }],
      }),
    });

    const locales = {
      '': { lang: 'en' },
      es: { lang: 'es', prefix: '/es' },
    };

    await setConfig({ locales });
    expect(loc`welcome`).to.equal('Bienvenido');
    expect(document.documentElement.lang).to.equal('es');
  });
});
