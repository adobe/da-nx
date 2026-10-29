/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import {
  createRolloutResolver,
  expandHtml,
  expandJson,
  getLocaleValues,
  getTabName,
  hasTokens,
  parseRolloutConfig,
} from '../../nx/blocks/loc/utils/placeholders.js';
import { rolloutLang } from '../../nx/blocks/loc/views/rollout/index.js';
import { mergeCopy, overwriteCopy } from '../../nx/blocks/loc/project/index.js';

const sheet = (rows) => ({ total: rows.length, offset: 0, limit: rows.length, data: rows });

const CONFIG = {
  ':names': ['nl-nl', 'en-nl', 'en-to', 'eu/nl-nl', '/'],
  ':type': 'multi-sheet',
  'nl-nl': sheet([
    { key: 'country', value: 'Nederland' },
    { key: 'countryCode', value: 'nl' },
  ]),
  'en-nl': sheet([{ key: 'country', value: 'Netherlands' }]),
  'en-to': sheet([{ key: 'country', value: 'Tonga' }]),
  'eu/nl-nl': sheet([{ key: 'country', value: 'EU Nederland' }]),
  '/': sheet([{ key: 'country', value: 'Root' }]),
};

const valuesFor = (root, config = CONFIG) => getLocaleValues({
  config: parseRolloutConfig(config),
  root,
});
const values = (obj) => new Map(Object.entries(obj));
const doc = (main) => `<body><header></header><main>${main}</main><footer></footer></body>`;
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

describe('rollout placeholders - config', () => {
  it('maps destination roots to exact tab names', () => {
    expect(getTabName('/nl-nl')).to.equal('nl-nl');
    expect(getTabName('/eu/nl-nl/')).to.equal('eu/nl-nl');
    expect(getTabName('/')).to.equal('/');
  });

  it('reads the same key independently per locale tab', () => {
    expect(valuesFor('/nl-nl').values.get('country')).to.equal('Nederland');
    expect(valuesFor('/en-nl').values.get('country')).to.equal('Netherlands');
    expect(valuesFor('/en-to').values.get('country')).to.equal('Tonga');
    expect(valuesFor('/eu/nl-nl').values.get('country')).to.equal('EU Nederland');
    expect(valuesFor('/').values.get('country')).to.equal('Root');
  });

  it('passes through locales without a tab instead of falling back', () => {
    expect(valuesFor('/de-de')).to.deep.equal({ passthrough: true });
    expect(valuesFor('/nl')).to.deep.equal({ passthrough: true });
  });

  it('rejects malformed tabs and rows', () => {
    const bad = (rows, extra = {}) => valuesFor('/x', { ':names': ['x'], x: { ...sheet(rows), ...extra } }).error;
    expect(bad([{ key: 'a', value: '1' }, { key: 'a', value: '2' }])).to.include('duplicates key "a"');
    expect(bad([{ key: '1a', value: 'x' }])).to.include('invalid key');
    expect(bad([{ key: 'a' }])).to.include('no value');
    expect(bad([{ key: 'a', value: 3 }])).to.include('must be text');
    expect(bad([{ key: 'a', value: 'x' }], { total: 5 })).to.include('incomplete');
    expect(valuesFor('/x', { ':names': ['x'], x: { rows: [] } }).error).to.include('not a valid sheet');
    expect(valuesFor('/x', { data: [] }).error).to.include('one named tab per locale');
  });

  it('accepts names in any script with limited punctuation', () => {
    const ok = ['Côte d\'Ivoire', 'Nederland', 'São Tomé', 'Ελλάδα', '日本', 'Saint-Martin, Fr.', 'Zone 3', ''];
    ok.forEach((value) => {
      expect(valuesFor('/x', { ':names': ['x'], x: sheet([{ key: 'a', value }]) }).values.get('a')).to.equal(value);
    });
  });

  it('rejects values outside the grammar', () => {
    const unsafe = [
      '<b>x</b>', 'a"b', 'a&b', 'javascript:alert(1)', 'https://a.com', 'a/b', 'a\\b', 'a=b',
      'a?b', 'a#b', '50%', '{{b}}', 'a}b', 'line\nbreak', 'tab\there', 'a\u0000', 'x'.repeat(101),
    ];
    unsafe.forEach((value) => {
      const { error } = valuesFor('/x', { ':names': ['x'], x: sheet([{ key: 'a', value }]) });
      expect(error, value).to.include('may only contain letters, digits, spaces');
    });
  });

  it('allows empty values and skips blank rows', () => {
    const { values: vals } = valuesFor('/x', { ':names': ['x'], x: sheet([{ key: 'a', value: '' }, { key: '', value: '' }]) });
    expect(vals.get('a')).to.equal('');
    expect(vals.size).to.equal(1);
  });
});

describe('rollout placeholders - HTML', () => {
  it('replaces only the token in surrounding text', () => {
    const vals = values({ country: 'Nederland' });
    const { content } = expandHtml({ content: doc('<h1>Paginatitel | Fedex {{country}}</h1>'), values: vals });
    expect(parse(content).querySelector('h1').textContent).to.equal('Paginatitel | Fedex Nederland');
    expect(content.startsWith('<body>')).to.be.true;
  });

  it('resolves text, metadata, alt, title and link segments', () => {
    const vals = values({ country: 'Côte d\'Ivoire', countryCode: 'en-ci' });
    const html = doc(`
      <div class="metadata"><div><div>title</div><div>Fedex {{ country }}</div></div>
      <div><div>canonical</div><div>/shipping/{{countryCode}}</div></div></div>
      <p><a href="https://www.fedex.com/shipping/{{countryCode}}/x.html?c={{countryCode}}#{{countryCode}}" title="{{country}}">Help</a></p>
      <img src="/img/{{countryCode}}.png" alt="{{country}} map">`);
    const { content, errors } = expandHtml({ content: html, values: vals });
    expect(errors).to.be.undefined;
    const out = parse(content);
    const metaCells = out.querySelectorAll('.metadata > div > div:last-child');
    expect(metaCells[0].textContent).to.equal('Fedex Côte d\'Ivoire');
    expect(metaCells[1].textContent).to.equal('/shipping/en-ci');
    const link = out.querySelector('a');
    expect(link.getAttribute('href')).to.equal('https://www.fedex.com/shipping/en-ci/x.html?c=en-ci#en-ci');
    expect(link.getAttribute('title')).to.equal('Côte d\'Ivoire');
    expect(out.querySelector('img').getAttribute('src')).to.equal('/img/en-ci.png');
    expect(out.querySelector('img').getAttribute('alt')).to.equal('Côte d\'Ivoire map');
  });

  it('leaves tokens in unsupported places unchanged', () => {
    const vals = values({ country: 'Tonga', code: 'to' });
    const html = doc(`
      <p aria-label="{{country}}" data-x="{{country}}" style="--c: {{code}}" onclick="{{code}}">x</p>
      <picture><source srcset="/img/{{code}}.webp 1x"></picture>
      <script>var c = '{{country}}';</script>
      <template><p>{{country}}</p></template>`);
    const { content, errors } = expandHtml({ content: html, values: vals });
    expect(errors).to.be.undefined;
    const out = parse(content);
    const p = out.querySelector('main > p');
    ['aria-label', 'data-x'].forEach((name) => expect(p.getAttribute(name)).to.equal('{{country}}'));
    expect(p.getAttribute('style')).to.equal('--c: {{code}}');
    expect(p.getAttribute('onclick')).to.equal('{{code}}');
    expect(out.querySelector('source').getAttribute('srcset')).to.equal('/img/{{code}}.webp 1x');
    expect(out.querySelector('script').textContent).to.include('{{country}}');
    expect(out.querySelector('template').innerHTML).to.include('{{country}}');
  });

  it('keeps allowed punctuation literal', () => {
    const v = 'Côte d\'Ivoire, St. Kitts-Nevis 2';
    const { content } = expandHtml({ content: doc('<p title="{{v}}">{{v}}</p>'), values: values({ v }) });
    const p = parse(content).querySelector('p');
    expect(p.textContent).to.equal(v);
    expect(p.getAttribute('title')).to.equal(v);
  });

  it('leaves DA system metadata untouched', () => {
    const meta = '<div class="da-metadata"><div><div>note</div><div>{{country}}</div></div></div>';
    const html = `<body><main><p>{{country}}</p></main>${meta}</body>`;
    const { content } = expandHtml({ content: html, values: values({ country: 'Tonga' }) });
    const out = parse(content);
    expect(out.querySelector('main p').textContent).to.equal('Tonga');
    expect(out.querySelector('.da-metadata').textContent).to.include('{{country}}');
  });

  it('reports missing values, unsafe link use and split tokens', () => {
    const run = (main, vals = {}) => expandHtml({ content: doc(main), values: values(vals) }).errors?.join(' ');
    expect(run('<h1>{{country}}</h1>')).to.include('missing value for {{country}} (text in <h1>)');
    expect(run('<a href="{{u}}">x</a>', { u: 'to' })).to.include('{{u}} must come after the start of a link');
    expect(run('<a href=" {{u}}/x">x</a>', { u: 'to' })).to.include('{{u}} must come after the start of a link');
    expect(run('<a href="https://{{u}}.fedex.com/x">x</a>', { u: 'to' })).to.include('{{u}} must come after');
    expect(run('<a href="https://fedex.com{{u}}">x</a>', { u: 'to' })).to.include('{{u}} must come after');
    expect(run('<a href="mailto:{{u}}@fedex.com">x</a>', { u: 'to' })).to.include('{{u}} must come after');
    expect(run('<a href="//{{u}}.fedex.com/x">x</a>', { u: 'to' })).to.include('{{u}} must come after');
    expect(run('<a href="//fedex.com/{{u}}">x</a>', { u: 'to' })).to.be.undefined;
    expect(run('<a href="https://fedex.com/{{u}}">x</a>', { u: 'to' })).to.be.undefined;
    expect(run('<a href="/x/{{u}}">x</a>', { u: 'Côte d\'Ivoire' })).to.include('{{u}} in a link may only contain');
    expect(run('<img src="/x/{{u}}.png">', { u: 'a.b' })).to.include('{{u}} in a link may only contain');
    expect(run('<p>{{<strong>country</strong>}}</p>', { country: 'Tonga' })).to.include('split by formatting (<p>)');
  });
});

describe('rollout placeholders - JSON', () => {
  it('replaces string cells across tabs and preserves types and bookkeeping', () => {
    const json = {
      ':names': ['a', 'b'],
      ':type': 'multi-sheet',
      a: { total: 1, offset: 0, limit: 1, data: [{ title: 'Fedex {{country}}', n: 1, ok: true, empty: null }] },
      b: { total: 1, offset: 0, limit: 1, data: [{ path: '/x/{{code}}', q: 'say "{{country}}"' }] },
    };
    const vals = values({ country: 'Côte d\'Ivoire', code: 'en-ci' });
    const { content } = expandJson({ content: JSON.stringify(json), values: vals });
    const out = JSON.parse(content);
    expect(out[':names']).to.deep.equal(['a', 'b']);
    expect(out.a.total).to.equal(1);
    expect(out.a.data[0]).to.deep.equal({ title: 'Fedex Côte d\'Ivoire', n: 1, ok: true, empty: null });
    expect(out.b.data[0]).to.deep.equal({ path: '/x/en-ci', q: 'say "Côte d\'Ivoire"' });
  });

  it('reports missing values with their location', () => {
    const json = { ':names': ['a'], a: sheet([{ title: '{{nope}}' }]) };
    const { errors } = expandJson({ content: JSON.stringify(json), values: values({}) });
    expect(errors[0]).to.include('a.data[0].title');
  });
});

describe('rollout placeholders - resolver', () => {
  const okResp = (body) => ({
    ok: true, status: 200, json: async () => body, text: async () => body,
  });

  it('does not fetch configuration for token-free content', async () => {
    const load = sinon.stub();
    const { expand } = createRolloutResolver({ load, sitePath: '/org/site' });
    const content = doc('<p>Hello {{ not a key }}</p>');
    expect(await expand({ content, root: '/nl-nl', path: '/org/site/nl-nl/a.html' })).to.deep.equal({ content });
    expect(hasTokens(content)).to.be.false;
    expect(load.called).to.be.false;
  });

  it('loads configuration once per invocation and isolates destinations', async () => {
    const load = sinon.stub().resolves(okResp(CONFIG));
    const { expand } = createRolloutResolver({ load, sitePath: '/org/site' });
    const content = doc('<h1>Page title | Fedex {{country}}</h1>');
    const [nl, to] = await Promise.all([
      expand({ content, root: '/en-nl', path: '/org/site/en-nl/a.html' }),
      expand({ content, root: '/en-to', path: '/org/site/en-to/a.html' }),
    ]);
    expect(parse(nl.content).querySelector('h1').textContent).to.equal('Page title | Fedex Netherlands');
    expect(parse(to.content).querySelector('h1').textContent).to.equal('Page title | Fedex Tonga');
    expect(load.calledOnceWith('/org/site/.da/rollout-placeholders.json')).to.be.true;
  });

  it('leaves content untouched when no configuration exists', async () => {
    const load = sinon.stub().resolves({ ok: false, status: 404 });
    const { expand } = createRolloutResolver({ load, sitePath: '/org/site' });
    const content = '<p>{{country}}</p>';
    expect(await expand({ content, root: '/nl-nl', path: '/org/site/nl-nl/a.html' })).to.deep.equal({ content });
    expect(load.calledOnceWith('/org/site/.da/rollout-placeholders.json')).to.be.true;
  });

  it('reports an unreadable configuration document', async () => {
    const load = sinon.stub().resolves({ ok: false, status: 500 });
    const { expand } = createRolloutResolver({ load, sitePath: '/org/site' });
    const { error } = await expand({ content: '<p>{{country}}</p>', root: '/nl-nl', path: '/org/site/nl-nl/a.html' });
    expect(error).to.include('/org/site/nl-nl/a.html').and.include('could not read /.da/rollout-placeholders.json (500)');
  });

  it('detects tokens split by formatting before skipping configuration', async () => {
    const load = sinon.stub().resolves(okResp(CONFIG));
    const { expand } = createRolloutResolver({ load, sitePath: '/org/site' });
    const { error } = await expand({ content: doc('<p>{{<em>country</em>}}</p>'), root: '/nl-nl', path: '/org/site/nl-nl/a.html' });
    expect(error).to.include('split by formatting');
  });

  describe('prepareSource', () => {
    const source = doc('<p>{{country}}</p>');
    const SRC = '/org/site/langstore/en/a.html';
    const makeLoad = (config, body = source) => sinon.stub().callsFake(async (path) => (
      path.endsWith('.json') ? config : okResp(body)));
    const urlFor = (code) => ({ source: SRC, destination: `/org/site${code}/a.html`, root: code });

    it('expands fetched sources per destination and reads each source once', async () => {
      const load = makeLoad(okResp(CONFIG));
      const { prepareSource } = createRolloutResolver({ load, sitePath: '/org/site' });
      const [nl, to] = [urlFor('/en-nl'), urlFor('/en-to')];
      expect(await prepareSource(nl)).to.deep.equal({});
      expect(await prepareSource(to)).to.deep.equal({});
      expect(parse(nl.sourceHtml).querySelector('p').textContent).to.equal('Netherlands');
      expect(parse(to.sourceHtml).querySelector('p').textContent).to.equal('Tonga');
      expect(load.callCount).to.equal(2);
    });

    it('does nothing and reads no source when no configuration exists', async () => {
      const load = makeLoad({ ok: false, status: 404 });
      const { prepareSource } = createRolloutResolver({ load, sitePath: '/org/site' });
      const url = urlFor('/en-nl');
      expect(await prepareSource(url)).to.deep.equal({});
      expect(url.sourceHtml).to.be.undefined;
      expect(load.calledOnceWith('/org/site/.da/rollout-placeholders.json')).to.be.true;
    });

    it('leaves token-free sources to the copy helpers', async () => {
      const load = makeLoad(okResp(CONFIG), doc('<p>Hello</p>'));
      const { prepareSource } = createRolloutResolver({ load, sitePath: '/org/site' });
      const url = urlFor('/en-nl');
      expect(await prepareSource(url)).to.deep.equal({});
      expect(url.sourceHtml).to.be.undefined;
    });

    it('keeps tokens for locales without a tab', async () => {
      const { prepareSource } = createRolloutResolver({ load: makeLoad(okResp(CONFIG)), sitePath: '/org/site' });
      const url = urlFor('/de-de');
      expect(await prepareSource(url)).to.deep.equal({});
      expect(url.sourceHtml).to.be.undefined;
    });

    it('fails closed when the source cannot be read', async () => {
      const failing = sinon.stub().callsFake(async (path) => (
        path.endsWith('.json') ? okResp(CONFIG) : { ok: false, status: 500 }));
      const rejecting = sinon.stub().callsFake(async (path) => {
        if (path.endsWith('.json')) return okResp(CONFIG);
        throw new Error('network');
      });
      const failed = urlFor('/en-nl');
      const rejected = urlFor('/en-nl');
      const { error } = await createRolloutResolver({ load: failing, sitePath: '/org/site' }).prepareSource(failed);
      expect(error).to.include('could not read /org/site/langstore/en/a.html (500)');
      const { error: netError } = await createRolloutResolver({ load: rejecting, sitePath: '/org/site' }).prepareSource(rejected);
      expect(netError).to.include('could not read /org/site/langstore/en/a.html');
    });
  });
});

describe('rolloutLang with placeholders', () => {
  let originalFetch;
  let posts;
  let regional;
  let hasConfig;

  const SOURCE = doc('<div><h1>Page title | Fedex {{country}}</h1></div>');

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    posts = {};
    regional = {};
    hasConfig = true;
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method && opts.method !== 'GET') {
        if (opts.body instanceof FormData) posts[url] = await opts.body.get('data').text();
        return { ok: true, status: 200, headers, text: async () => '' };
      }
      if (url.endsWith('/.da/rollout-placeholders.json') && hasConfig) {
        return { ok: true, status: 200, headers, json: async () => CONFIG };
      }
      if (url.includes('/langstore/en/')) return { ok: true, status: 200, headers, text: async () => SOURCE };
      if (regional[url]) return { ok: true, status: 200, headers, text: async () => regional[url] };
      return { ok: false, status: 404, headers, text: async () => '' };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  const run = (locales, behavior = 'overwrite') => {
    const lang = { name: 'English', location: '/langstore/en', locales, rollout: {} };
    const conf = {
      org: 'org',
      site: 'site',
      title: 'Proj',
      options: { 'source.language': { location: '/' }, 'rollout.conflict.behavior': behavior },
      lang,
      urls: [{ suppliedPath: '/page' }],
      actions: { requestUpdate: () => {} },
    };
    return { lang, result: rolloutLang(conf) };
  };

  const posted = (path) => {
    const key = Object.keys(posts).find((url) => url.endsWith(`/source/org/site${path}`));
    return key && parse(posts[key]).querySelector('h1').textContent;
  };

  it('expands per destination locale and completes', async () => {
    const { lang, result } = run([{ code: '/en-nl' }, { code: '/en-to' }]);
    expect(await result).to.deep.equal({});
    expect(posted('/en-nl/page.html')).to.equal('Page title | Fedex Netherlands');
    expect(posted('/en-to/page.html')).to.equal('Page title | Fedex Tonga');
    expect(lang.rollout).to.deep.equal({ status: 'complete', saved: 2 });
  });

  it('keeps tokens for intermediate destinations without a tab', async () => {
    const { result } = run([{ code: '/en-nl' }, { code: '/eu' }]);
    expect(await result).to.deep.equal({});
    expect(posted('/en-nl/page.html')).to.equal('Page title | Fedex Netherlands');
    expect(posted('/eu/page.html')).to.equal('Page title | Fedex {{country}}');
  });

  it('skips invalid destinations, finishes valid ones and stays retryable', async () => {
    CONFIG['en-to'].data.push({ key: 'country', value: 'dup' });
    const { lang, result } = run([{ code: '/en-nl' }, { code: '/en-to' }]);
    const { errors } = await result;
    CONFIG['en-to'].data.pop();
    expect(errors).to.have.length(1);
    expect(errors[0].error).to.include('/org/site/en-to/page.html').and.include('duplicates key "country"');
    expect(posted('/en-nl/page.html')).to.equal('Page title | Fedex Netherlands');
    expect(posted('/en-to/page.html')).to.be.undefined;
    expect(lang.rollout).to.deep.equal({ status: 'not started', saved: 1 });
    expect(lang.locales.map((locale) => locale.saved)).to.deep.equal([1, 0]);
  });

  it('copy helpers use prepared source html for overwrite and merge fallback', async () => {
    const sourceHtml = doc('<div><h1>Prepared</h1></div>');
    const src = '/org/site/langstore/en/page.html';
    await overwriteCopy({ source: src, destination: '/org/site/en-nl/page.html', sourceHtml }, 'P');
    await mergeCopy({ source: src, destination: '/org/site/en-to/page.html', sourceHtml }, 'P');
    expect(posted('/en-nl/page.html')).to.equal('Prepared');
    expect(posted('/en-to/page.html')).to.equal('Prepared');
  });

  it('rolls out unchanged content when no configuration exists', async () => {
    hasConfig = false;
    const { lang, result } = run([{ code: '/en-nl' }]);
    expect(await result).to.deep.equal({});
    expect(posted('/en-nl/page.html')).to.equal('Page title | Fedex {{country}}');
    expect(lang.rollout).to.deep.equal({ status: 'complete', saved: 1 });
  });

  it('merges prepared content, skips unchanged reruns and falls back with expanded content', async () => {
    const { result: first } = run([{ code: '/en-nl' }], 'merge');
    await first;
    expect(posted('/en-nl/page.html')).to.equal('Page title | Fedex Netherlands');

    const key = Object.keys(posts).find((url) => url.endsWith('/en-nl/page.html'));
    regional[key] = posts[key];
    posts = {};
    const { lang, result: rerun } = run([{ code: '/en-nl' }], 'merge');
    expect(await rerun).to.deep.equal({});
    expect(posted('/en-nl/page.html')).to.be.undefined;
    expect(lang.rollout.status).to.equal('complete');

    regional[key] = doc('<div><h1>Locally edited title</h1></div>');
    await run([{ code: '/en-nl' }], 'merge').result;
    const merged = posts[Object.keys(posts).find((url) => url.endsWith('/en-nl/page.html'))];
    expect(merged).to.include('Page title | Fedex Netherlands').and.include('Locally edited title');
    expect(merged).to.not.include('{{country}}');
  });
});
