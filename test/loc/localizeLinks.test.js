import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import {
  clearConfigCache,
  copy,
  getConfiguredLocations,
  localizeLinks,
} from '../../nx/blocks/loc/utils/utils.js';
import { saveLangItemsToDa } from '../../nx/blocks/loc/views/translate/index.js';
import { removeDnt } from '../../nx/blocks/loc/dnt/dnt.js';
import { removeDnt as removeGlaasDnt } from '../../nx/blocks/loc/connectors/glaas/dnt.js';

const ORG = 'org';
const SITE = 'site';
const PAGE = `https://main--${SITE}--${ORG}.aem.page`;
const link = (href) => `<p><a href="${href}">x</a></p>`;
const hrefs = (html) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a')]
  .map((a) => a.getAttribute('href'));

describe('localizeLinks', () => {
  const run = (href, { from = ['/en-nl'], dest = '/nl-nl', locations = [] } = {}) => hrefs(
    localizeLinks({
      html: link(href), org: ORG, site: SITE, fromPrefixes: from, destPrefix: dest, locations,
    }),
  )[0];

  it('moves root-relative links in the source folder to the destination folder', () => {
    expect(run('/en-nl/home')).to.equal('/nl-nl/home');
    expect(run('/en-nl')).to.equal('/nl-nl');
    expect(run('/en-nl/')).to.equal('/nl-nl/');
  });

  it('moves links to the site own aem and hlx hosts, keeping the host', () => {
    expect(run(`${PAGE}/en-nl/home`)).to.equal(`${PAGE}/nl-nl/home`);
    expect(run(`https://feat--${SITE}--${ORG}.aem.live/en-nl/home`))
      .to.equal(`https://feat--${SITE}--${ORG}.aem.live/nl-nl/home`);
    expect(run(`https://main--${SITE}--${ORG}.hlx.page/en-nl`))
      .to.equal(`https://main--${SITE}--${ORG}.hlx.page/nl-nl`);
    expect(run(`https://main--${SITE}--${ORG}.aem.page:443/en-nl/x`))
      .to.equal(`https://main--${SITE}--${ORG}.aem.page:443/nl-nl/x`);
  });

  it('leaves links alone when a backslash puts the site host in the path', () => {
    const href = `https://example.com\\main--${SITE}--${ORG}.aem.page/en-nl/x`;
    expect(run(href)).to.equal(href);
  });

  it('keeps query strings and hashes', () => {
    expect(run('/en-nl/home?a=1#top')).to.equal('/nl-nl/home?a=1#top');
    expect(run(`${PAGE}/en-nl/home#top`)).to.equal(`${PAGE}/nl-nl/home#top`);
  });

  it('works for nested region and language folders', () => {
    const opts = { from: ['/emea/en'], dest: '/emea/de' };
    expect(run('/emea/en/products', opts)).to.equal('/emea/de/products');
    expect(run('/emea/fr/products', opts)).to.equal('/emea/fr/products');
  });

  it('only matches whole folders', () => {
    expect(run('/en-nlx/home')).to.equal('/en-nlx/home');
    expect(run('/en-nl/home', { from: ['/en'], dest: '/de' })).to.equal('/en-nl/home');
  });

  it('leaves links in a more specific configured location alone', () => {
    const opts = { from: ['/en'], dest: '/de', locations: ['/en/us'] };
    expect(run('/en/us/home', opts)).to.equal('/en/us/home');
    expect(run('/en/home', opts)).to.equal('/de/home');
  });

  it('matches encoded folder names and keeps the rest of the path as written', () => {
    const ja = { from: ['/ja/日本'], dest: '/ja/jp' };
    expect(run('/ja/%E6%97%A5%E6%9C%AC/%E3%81%82?q=%20', ja)).to.equal('/ja/jp/%E3%81%82?q=%20');
    expect(run('/ja/日本/x', { ...ja, from: ['/ja/%E6%97%A5%E6%9C%AC'] })).to.equal('/ja/jp/x');
    expect(run(`${PAGE}/ja/%E6%97%A5%E6%9C%AC/%E3%81%82#h`, ja)).to.equal(`${PAGE}/ja/jp/%E3%81%82#h`);
    expect(run('/ja/日本/x', { ...ja, dest: '/ja/%E6%97%A5%E6%9C%AC' })).to.equal('/ja/日本/x');
    const opts = { from: ['/en'], dest: '/de', locations: ['/en/us'] };
    expect(run('/en/%75s/x', opts)).to.equal('/en/%75s/x');
    expect(run('/%65n/x', opts)).to.equal('/de/x');
  });

  it('does not treat encoded slashes or bad encoding as folder matches', () => {
    expect(run('/en-nl%2Fhome')).to.equal('/en-nl%2Fhome');
    expect(run('/en-nl/%zz')).to.equal('/nl-nl/%zz');
    expect(run('/en-%zz/x', { from: ['/en-%zz'] })).to.equal('/nl-nl/x');
  });

  it('leaves other folders, other hosts, mailto and anchor links alone', () => {
    [
      '/global/home',
      'https://www.example.com/en-nl/home',
      `https://main--other--${ORG}.aem.page/en-nl/home`,
      `https://main--${SITE}--${ORG}.aem.page.evil.com/en-nl/home`,
      '//example.com/en-nl/x',
      'mailto:a@b.com',
      '#top',
    ].forEach((href) => expect(run(href)).to.equal(href));
  });

  it('returns the html untouched when nothing changes', () => {
    const html = '<p><img src="/en-nl/a.png"> <code>&lt;a href="/en-nl/x"&gt;</code></p>';
    expect(localizeLinks({
      html, org: ORG, site: SITE, fromPrefixes: ['/en-nl'], destPrefix: '/nl-nl',
    })).to.equal(html);
  });

  it('does nothing when the source is the root', () => {
    expect(run('/home', { from: ['/'] })).to.equal('/home');
  });

  it('moves links to the site root when the destination is the root', () => {
    const opts = { from: ['/en'], dest: '/', locations: ['/en/us'] };
    expect(run('/en/about', opts)).to.equal('/about');
    expect(run('/en', opts)).to.equal('/');
    expect(run('/en?q=1#h', opts)).to.equal('/?q=1#h');
    expect(run(`${PAGE}/en/about#h`, opts)).to.equal(`${PAGE}/about#h`);
    expect(run(`${PAGE}/en`, opts)).to.equal(`${PAGE}/`);
    expect(run('/en/us/x', opts)).to.equal('/en/us/x');
    expect(run('/fragments/x', opts)).to.equal('/fragments/x');
  });

  it('keeps a link that a root destination would turn into an external one', () => {
    const opts = { from: ['/en'], dest: '/' };
    expect(run('/en//example.com/x', opts)).to.equal('/en//example.com/x');
    expect(run('/en/\\example.com/x', opts)).to.equal('/en/\\example.com/x');
    expect(run('/en/\t/example.com/x', opts)).to.equal('/en/\t/example.com/x');
    expect(run(`${PAGE}/en//example.com/x`, opts)).to.equal(`${PAGE}//example.com/x`);
  });

  it('does not nest the destination when it sits inside the source folder', () => {
    const opts = { from: ['/en'], dest: '/en/us' };
    expect(run('/en/us/x', opts)).to.equal('/en/us/x');
    expect(run('/en/x', opts)).to.equal('/en/us/x');
  });

  it('accepts several source folders', () => {
    const opts = { from: ['/en', '/fr'], dest: '/fr-ca' };
    expect(run('/fr/home', opts)).to.equal('/fr-ca/home');
    expect(run('/en/home', opts)).to.equal('/fr-ca/home');
  });

  it('updates link text that is the link itself, keeping its formatting', () => {
    const html = [
      `<p><a href="${PAGE}/en-nl/fragments/x"> ${PAGE}/en-nl/fragments/x </a></p>`,
      `<p><a href="${PAGE}/en-nl/y"><strong>${PAGE}/en-nl/y</strong></a></p>`,
      `<p><a href="${PAGE}/en-nl/z">See ${PAGE}/en-nl/z</a></p>`,
      '<p><a href="/en-nl/$&amp;">/en-nl/$&amp;</a></p>',
      '<p><a href="/en-nl/w">/en-nl/<strong>w</strong></a></p>',
    ].join('');
    const doc = new DOMParser().parseFromString(localizeLinks({
      html, org: ORG, site: SITE, fromPrefixes: ['/en-nl'], destPrefix: '/nl-nl',
    }), 'text/html');
    const links = [...doc.querySelectorAll('a')];
    expect(links[0].textContent).to.equal(` ${PAGE}/nl-nl/fragments/x `);
    expect(links[1].querySelector('strong').textContent).to.equal(`${PAGE}/nl-nl/y`);
    expect(links[2].textContent).to.equal(`See ${PAGE}/en-nl/z`);
    expect(links[3].textContent).to.equal('/nl-nl/$&');
    expect(links[4].getAttribute('href')).to.equal('/nl-nl/w');
    expect(links[4].innerHTML).to.equal('/en-nl/<strong>w</strong>');
  });
});

describe('localize links config', () => {
  it('collects locations, sources and locales without the root', () => {
    const rows = [
      { location: '/en', locales: '/en/us, /en/gb' },
      { location: '/emea/de', source: '/emea/en/', locales: '' },
      { location: '/' },
    ];
    expect(getConfiguredLocations(rows))
      .to.deep.equal(['/en', '/en/us', '/en/gb', '/emea/de', '/emea/en']);
  });
});

describe('saveLangItemsToDa link localizing', () => {
  let originalFetch;
  let saved;

  const languages = [
    { name: 'English NL', location: '/en-nl' },
    { name: 'Dutch', location: '/nl-nl' },
    { name: 'French', location: '/fr' },
    { name: 'French Canada', location: '/fr-ca' },
  ];

  const stubConfig = (value, extra = []) => {
    globalThis.fetch = sinon.stub().resolves({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        config: { data: [...(value ? [{ key: 'translate.links.localize', value }] : []), ...extra] },
        languages: { data: languages },
      }),
    });
  };

  const connector = (html, clean = (text) => removeDnt({ org: ORG, site: SITE, html: text })) => ({
    saveItems: async ({ urls, saveFn }) => {
      for (const url of urls) {
        url.sourceContent = await clean(html);
        await saveFn(url);
        url.status = 'success';
      }
      return urls;
    },
  });

  const save = (lang, conn, {
    suppliedPath = '/en-nl/home', sourceLocations = ['/en-nl'], behavior = 'overwrite', ext = 'html',
    snapshot, projectLangs = [], sourceLang = { location: '/en-nl' },
  } = {}) => (
    saveLangItemsToDa(
      { 'translate.conflict.behavior': behavior, 'source.language': sourceLang },
      {
        org: ORG,
        site: SITE,
        snapshot,
        langs: [
          { ...lang, translation: { status: 'translated' } },
          ...projectLangs.map((row) => ({ ...row, translation: { status: 'complete' } })),
        ],
        urls: [{ suppliedPath, basePath: '/home', ext }],
        sourceLocations,
      },
      conn,
      () => {},
    )
  );

  beforeEach(() => {
    setImsDetails('test-token');
    clearConfigCache();
    originalFetch = globalThis.fetch;
    saved = [];
    const record = async (url) => {
      saved.push(url);
      return { ok: true };
    };
    sinon.stub(copy, 'overwriteCopy').callsFake(record);
    sinon.stub(copy, 'mergeCopy').callsFake(record);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearConfigCache();
    sinon.restore();
  });

  it('keeps links as they are when the flag is off', async () => {
    stubConfig();
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')));
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/en-nl/about`]);
    expect(saved[0].destination).to.equal(`/${ORG}/${SITE}/nl-nl/home.html`);
  });

  it('saves dependent languages as they are when the flag is off', async () => {
    stubConfig(undefined, [{ key: 'source.language', value: 'French' }]);
    const html = `${link('/fr/about')}${link('/en-nl/contact')}`;
    await save({ name: 'French Canada', location: '/fr-ca', 'source language': 'French' }, connector(html));
    await save({ name: 'Dutch', location: '/nl-nl', 'source language': 'English NL' }, connector(html));
    expect(saved.map(({ sourceContent }) => hrefs(sourceContent))).to.deep.equal([
      [`${PAGE}/fr/about`, `${PAGE}/en-nl/contact`],
      [`${PAGE}/fr/about`, `${PAGE}/en-nl/contact`],
    ]);
  });

  it('moves links to the destination folder after DNT removal when the flag is on', async () => {
    stubConfig('true');
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')));
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/nl-nl/about`]);
  });

  it('reads the flag like other config keys: padded key and value, last row wins', async () => {
    stubConfig(undefined, [
      null,
      { key: 'translate.links.localize', value: 'false' },
      { key: ' translate.links.localize ', value: ' TRUE ' },
    ]);
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')));
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/nl-nl/about`]);
  });

  it('keeps links as they are when the flag is not true', async () => {
    stubConfig('yes');
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')));
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/en-nl/about`]);
  });

  it('moves links to the site root when the language lives at the root', async () => {
    stubConfig('true');
    await save({ name: 'Root', location: '/' }, connector(link('/en-nl/about')));
    expect(saved[0].destination).to.equal(`/${ORG}/${SITE}/home.html`);
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/about`]);
  });

  it('moves links after GLaaS DNT removal', async () => {
    stubConfig('true');
    const glaas = connector(link('/en-nl/about'), (text) => removeGlaasDnt(text, ORG, SITE));
    await save({ name: 'Dutch', location: '/nl-nl' }, glaas);
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/nl-nl/about`]);
  });

  it('also moves links from the folder a dependent language was translated from', async () => {
    stubConfig('true');
    const lang = { name: 'French Canada', location: '/fr-ca', 'source language': 'French' };
    await save(lang, connector(`${link('/fr/about')}${link('/en-nl/contact')}`));
    expect(hrefs(saved[0].sourceContent))
      .to.deep.equal([`${PAGE}/fr-ca/about`, `${PAGE}/fr-ca/contact`]);
  });

  it('uses the dependency location saved in the project over the current config', async () => {
    stubConfig('true');
    const lang = { name: 'French Canada', location: '/fr-ca', 'source language': 'French' };
    await save(lang, connector(`${link('/fr-old/about')}${link('/fr/contact')}`), {
      projectLangs: [{ name: 'French', location: '/fr-old' }],
    });
    expect(saved).to.have.length(1);
    expect(hrefs(saved[0].sourceContent))
      .to.deep.equal([`${PAGE}/fr-ca/about`, `${PAGE}/fr/contact`]);
  });

  it('moves links from the language source folder in region setups', async () => {
    stubConfig('true');
    const lang = { name: 'EMEA German', location: '/emea/de', source: '/emea/en' };
    await save(lang, connector(`${link('/emea/en/about')}${link('/us/en/pricing')}`), {
      suppliedPath: '/us/en/home',
      sourceLocations: ['/us/en', '/emea/en'],
    });
    expect(hrefs(saved[0].sourceContent))
      .to.deep.equal([`${PAGE}/emea/de/about`, `${PAGE}/us/en/pricing`]);
  });

  it('moves links from both the language source and its dependency in region setups', async () => {
    stubConfig('true');
    const lang = { name: 'EMEA French', location: '/emea/fr', source: '/emea/en', 'source language': 'French' };
    const html = `${link('/emea/en/about')}${link('/fr/contact')}${link('/us/en/pricing')}`;
    await save(lang, connector(html), { suppliedPath: '/us/en/home', sourceLocations: ['/us/en', '/emea/en'] });
    expect(hrefs(saved[0].sourceContent))
      .to.deep.equal([`${PAGE}/emea/fr/about`, `${PAGE}/emea/fr/contact`, `${PAGE}/us/en/pricing`]);
  });

  it('ignores a source language that is not in the languages sheet', async () => {
    stubConfig('true');
    const lang = { name: 'Dutch', location: '/nl-nl', 'source language': 'Nope' };
    await save(lang, connector(`${link('/en-nl/about')}${link('/fr/pricing')}`));
    expect(hrefs(saved[0].sourceContent))
      .to.deep.equal([`${PAGE}/nl-nl/about`, `${PAGE}/fr/pricing`]);
  });

  it('passes the moved links to a merge copy', async () => {
    stubConfig('true');
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')), { behavior: 'merge' });
    expect(copy.mergeCopy.calledOnce).to.be.true;
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/nl-nl/about`]);
  });

  it('does not treat the project source language as a dependency', async () => {
    stubConfig('true', [{ key: 'source.language', value: 'English NL' }]);
    const lang = { name: 'Dutch', location: '/nl-nl', 'source language': 'French' };
    await save(lang, connector(`${link('/en-nl/about')}${link('/fr/pricing')}`), {
      sourceLang: { name: 'French', location: '/en-nl' },
    });
    expect(hrefs(saved[0].sourceContent))
      .to.deep.equal([`${PAGE}/nl-nl/about`, `${PAGE}/fr/pricing`]);
  });

  it('moves links from the default source folder the content was fetched from', async () => {
    stubConfig('true');
    const html = `${link('/en-nl/pricing')}${link('/en-be/about')}`;
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(html), {
      suppliedPath: '/en-be/home',
      sourceLocations: ['/en-nl', '/en-be'],
    });
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/nl-nl/pricing`, `${PAGE}/en-be/about`]);
  });

  it('falls back to the project source language for urls outside the source locations', async () => {
    stubConfig('true');
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')), {
      suppliedPath: '/other/home',
      sourceLocations: [],
    });
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/nl-nl/about`]);
  });

  it('leaves non-html content untouched', async () => {
    stubConfig('true');
    const json = '{"data":[{"link":"<a href=\'/en-nl/about\'>x</a>"}]}';
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(json, (text) => text), { ext: 'json' });
    expect(saved[0].sourceContent).to.equal(json);
  });

  it('still saves when the config cannot be read', async () => {
    globalThis.fetch = sinon.stub().resolves({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => { throw new SyntaxError('bad json'); },
    });
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')));
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/en-nl/about`]);
  });

  it('still saves when the config sheets are malformed', async () => {
    globalThis.fetch = sinon.stub().resolves({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ config: { data: {} }, languages: { data: null } }),
    });
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')));
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/en-nl/about`]);
  });

  it('points links at the live folder when saving to a snapshot', async () => {
    stubConfig('true');
    await save({ name: 'Dutch', location: '/nl-nl' }, connector(link('/en-nl/about')), { snapshot: 'spring' });
    expect(saved[0].destination).to.equal(`/${ORG}/${SITE}/.snapshots/spring/nl-nl/home.html`);
    expect(hrefs(saved[0].sourceContent)).to.deep.equal([`${PAGE}/nl-nl/about`]);
  });
});
