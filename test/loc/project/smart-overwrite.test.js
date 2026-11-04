import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createCopy } from '../../../nx/public/loc/copy.js';
import { getBlockHashes } from '../../../nx/public/loc/regional-diff.js';

const DEST = '/org/site/apac/page.html';
const toPage = (main, metadata = '') => `<body><header></header><main><div>${main}</div></main>${metadata}<footer></footer></body>`;
const baseRow = (value) => `<div class="da-metadata"><div><div>rolloutbase</div><div>${value}</div></div></div>`;

const hashesOf = async (main) => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<main><div>${main}</div></main>`;
  return getBlockHashes({ doc, site: 'site', config: {} });
};

describe('smartOverwriteCopy', () => {
  let originalFetch;
  let engine;
  let destHtml;
  let destStatus;
  let saveOk;
  let saveThrows;
  let saved;
  let versionSaves;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    saved = undefined;
    versionSaves = 0;
    destStatus = 200;
    saveOk = true;
    saveThrows = false;
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method === 'POST' && url.includes(`/source${DEST}`)) {
        if (saveThrows) throw new Error('network');
        saved = await opts.body.get('data').text();
        return { ok: saveOk, status: saveOk ? 200 : 500, headers, json: async () => ({}), text: async () => '' };
      }
      if (url.includes('/versionsource/')) versionSaves += 1;
      if (opts.method && opts.method !== 'GET') return { ok: true, status: 200, headers, text: async () => '' };
      if (url.endsWith(`/source${DEST}`)) {
        return { ok: destStatus === 200, status: destStatus, headers, text: async () => destHtml };
      }
      return { ok: false, status: 404, headers, text: async () => '' };
    });
    engine = createCopy({ fetch: (url, opts) => globalThis.fetch(url, opts), daOrigin: 'https://admin.da.live' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  const smartOverwriteCopy = (url, title) => engine.smartOverwriteCopy(url, title);
  const mergeCopy = (url, title) => engine.mergeCopy(url, title);

  const rollout = (fn, sourceMain) => {
    const url = { source: '/org/site/page', destination: DEST, sourceContent: toPage(sourceMain) };
    return fn(url, 'Proj').then(() => url);
  };

  const expectBaselineOnly = async (url, sourceMain) => {
    expect(url.status).to.equal('success');
    expect(url.baselineOnly).to.be.true;
    expect(saved).to.include('<p>B local</p>');
    expect(saved).to.not.include('B global');
    expect(saved).to.not.include('da-diff');
    const hashes = await hashesOf(sourceMain);
    expect(saved).to.include(`<div>rolloutbase</div><div>/org/site/apac/page.html|${hashes.join(',')}</div>`);
  };

  it('only records the base on the first run', async () => {
    destHtml = toPage('<p>A</p><p>B local</p>');
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
    await expectBaselineOnly(url, '<p>A</p><p>B global</p>');
    expect(versionSaves).to.equal(0);
  });

  it('applies global changes made after the first run', async () => {
    destHtml = toPage('<p>A</p><p>B local</p><p>C</p>');
    await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p><p>C</p>');
    destHtml = saved;
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p><p>C2</p>');
    expect(url.baselineOnly).to.be.false;
    expect(saved).to.include('<p>A</p><p>B local</p><p>C2</p>');
    expect(versionSaves).to.equal(1);
  });

  it('keeps whitespace-sensitive content exactly as-is on the first run', async () => {
    const code = '<pre><code>line 1\n    indented  line 2</code></pre>';
    destHtml = toPage(code);
    await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(saved).to.include(code);
  });

  it('keeps whitespace-sensitive content and metadata on later rollouts', async () => {
    const code = '<pre><code>line 1\n    indented  line 2</code></pre>';
    const meta = '<div class="da-metadata"><div><div>label</div><div>Two  spaces</div></div></div>';
    destHtml = toPage(`<p>A</p>${code}`, meta);
    await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(saved).to.include('<div>Two  spaces</div>');
    destHtml = saved;
    await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(saved).to.include(code);
    expect(saved).to.include('<div>Two  spaces</div>');
  });

  it('keeps destination links exactly as authored on later rollouts', async () => {
    const link = '<p><a href="https://main--site--org.aem.page/local">Local</a></p>';
    destHtml = toPage(`<p>A</p>${link}`);
    await rollout(smartOverwriteCopy, '<p>A</p><p>B</p>');
    destHtml = saved;
    await rollout(smartOverwriteCopy, '<p>A2</p><p>B</p>');
    expect(saved).to.include('<p>A2</p>');
    expect(saved).to.include('https://main--site--org.aem.page/local');
  });

  it('keeps empty anchor paragraphs on later rollouts', async () => {
    destHtml = toPage('<p id="anchor"></p><p>A</p><p>B</p>');
    await rollout(smartOverwriteCopy, '<p>A</p><p>B</p>');
    destHtml = saved;
    await rollout(smartOverwriteCopy, '<p>A</p><p>B2</p>');
    expect(saved).to.include('<p id="anchor"></p><p>A</p><p>B2</p>');
  });

  it('reads a baseline value wrapped in a paragraph or whitespace', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    const meta = `<div class="da-metadata"><div><div>rolloutbase</div><div>\n  <p>/org/site/apac/page.html|${base.join(',')}</p>\n</div></div></div>`;
    destHtml = toPage('<p>A local</p><p>B</p>', meta);
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B2</p>');
    expect(url.baselineOnly).to.be.false;
    expect(saved).to.include('<p>A local</p><p>B2</p>');
  });

  it('keeps section wrapper attributes on later rollouts', async () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<main><div><p>A</p></div><div><p>B</p></div></main>';
    const base = await getBlockHashes({ doc, site: 'site', config: {} });
    destHtml = `<body><main><div id="local"><p>A</p></div><div><p>B</p></div></main>${baseRow(`/org/site/apac/page.html|${base.join(',')}`)}</body>`;
    const url = { source: '/org/site/page', destination: DEST, sourceContent: '<body><main><div><p>A</p></div><div><p>B2</p></div></main></body>' };
    await smartOverwriteCopy(url, 'Proj');
    expect(saved).to.include('<div id="local"><p>A</p></div><div><p>B2</p></div>');
  });

  it('keeps unresolved diff markers untouched on the first run', async () => {
    destHtml = toPage('<p>A</p><p da-diff-added="">B local</p><da-diff-deleted><p>B old</p></da-diff-deleted>');
    await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
    expect(saved).to.include('<p da-diff-added="">B local</p>');
    expect(saved).to.include('<da-diff-deleted><p>B old</p></da-diff-deleted>');
  });

  it('applies only new global changes when a base exists', async () => {
    const base = await hashesOf('<p>A</p><p>B</p><p>C</p>');
    destHtml = toPage('<p>A local</p><p>B</p><p>C</p>', baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B</p><p>C global</p>');
    expect(saved).to.include('<p>A local</p><p>B</p><p>C global</p>');
    expect(saved).to.not.include('da-diff');
    expect(url.skipped).to.equal(0);
    const next = await hashesOf('<p>A</p><p>B</p><p>C global</p>');
    expect(saved).to.include(`/org/site/apac/page.html|${next.join(',')}`);
  });

  it('keeps the localized block and reports it as skipped', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
    expect(saved).to.include('<p>A</p><p>B local</p>');
    expect(saved).to.not.include('B global');
    expect(url.skipped).to.equal(1);
  });

  it('only records the base when the recorded base is for another page', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow(`/org/site/page|${base.join(',')}`));
    await expectBaselineOnly(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
  });

  it('uses an empty recorded base instead of falling back to a merge', async () => {
    destHtml = toPage('<p>Local</p>', baseRow('/org/site/apac/page.html|'));
    const url = await rollout(smartOverwriteCopy, '<p>New</p>');
    expect(saved).to.not.include('da-diff');
    expect(saved).to.include('<div><p>Local</p></div><div><p>New</p></div>');
    expect(url.skipped).to.equal(0);
  });

  it('only records the base when the recorded base is malformed', async () => {
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow('/org/site/apac/page.html|not-a-hash'));
    await expectBaselineOnly(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
  });

  it('only records the base when the recorded base is for an index page with the same base path', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow(`/org/site/apac/page/index.html|${base.join(',')}`));
    await expectBaselineOnly(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
  });

  [['a missing', 404, ''], ['an empty', 200, toPage('')]].forEach(([name, status, html]) => {
    it(`copies the source to ${name} destination and records the base for the next rollout`, async () => {
      destStatus = status;
      destHtml = html;
      const first = await rollout(smartOverwriteCopy, '<p>A</p><p>B</p>');
      expect(first.status).to.equal('success');
      expect(saved).to.include('<p>A</p><p>B</p>');
      expect(saved).to.include(`/org/site/apac/page.html|${(await hashesOf('<p>A</p><p>B</p>')).join(',')}`);

      destStatus = 200;
      destHtml = saved;
      const second = await rollout(smartOverwriteCopy, '<p>A2</p><p>B</p>');
      expect(saved).to.include('<p>A2</p><p>B</p>');
      expect(saved).to.not.include('da-diff');
      expect(second.skipped).to.equal(0);
    });
  });

  it('treats a whitespace-only destination as empty', async () => {
    destHtml = '<body><header></header><main>\n  <div>\n    <p></p>\n  </div>\n</main><footer></footer></body>';
    await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(saved).to.include('<p>A</p>');
    expect(saved).to.not.include('da-diff');
    expect(saved).to.include('rolloutbase');
  });

  it('never overwrites a destination response without a main element', async () => {
    destHtml = '<html><body><p>Unexpected</p></body></html>';
    const url = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(url.status).to.equal('error');
    expect(url.error).to.include(DEST);
    expect(saved).to.be.undefined;
  });

  it('keeps a destination emptied on purpose when the source is unchanged', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('', baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B</p>');
    expect(url.status).to.equal('success');
    expect(saved).to.not.include('<p>A</p>');
    expect(saved).to.include('rolloutbase');
  });

  it('never saves when the source has no main element', async () => {
    destHtml = toPage('<p>A local</p>');
    const url = { source: '/org/site/page', destination: DEST, sourceContent: '<body><p>Unexpected</p></body>' };
    await smartOverwriteCopy(url, 'Proj');
    expect(url.status).to.equal('error');
    expect(saved).to.be.undefined;
  });

  it('reports an error for a whitespace-only destination response', async () => {
    destHtml = '  \n ';
    const url = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(url.status).to.equal('error');
    expect(saved).to.be.undefined;
  });

  it('treats a textless authored block as content, not an empty page', async () => {
    destHtml = toPage('<div class="divider"><div><div></div></div></div>');
    const url = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(saved).to.include('divider');
    expect(url.baselineOnly).to.be.true;
  });

  it('never saves when content sits outside sections', async () => {
    const base = await hashesOf('<p>A</p>');
    destHtml = toPage('<p>A</p>', baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    const sourceUrl = { source: '/org/site/page', destination: DEST, sourceContent: '<body><main><p>Error</p></main></body>' };
    await smartOverwriteCopy(sourceUrl, 'Proj');
    expect(sourceUrl.status).to.equal('error');
    destHtml = '<body><main><p>Loose</p></main></body>';
    const destUrl = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(destUrl.status).to.equal('error');
    destHtml = '<body><main><div>Localized text<p>A</p></div></main></body>';
    const textUrl = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(textUrl.status).to.equal('error');
    expect(saved).to.be.undefined;
  });

  it('never saves a destination with more than one main or malformed metadata', async () => {
    destHtml = '<body><main><div><p>A</p></div></main><main><p>Localized</p></main></body>';
    const twoMains = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(twoMains.status).to.equal('error');
    destHtml = toPage('<p>A</p>', '<div class="da-metadata"><div><div>broken</div></div></div>');
    const badMeta = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(badMeta.status).to.equal('error');
    expect(saved).to.be.undefined;
  });

  it('keeps metadata values as authored', async () => {
    const meta = '<div class="da-metadata"><div><div>loc-images</div><div>https://Example.com/Img.PNG</div></div></div>';
    destHtml = toPage('<p>A</p>', meta);
    await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(saved).to.include('https://Example.com/Img.PNG');
  });

  it('only records the base when the recorded base has extra fields', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow(`/org/site/apac/page.html|${base.join(',')}|junk`));
    await expectBaselineOnly(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
  });

  it('reports an error when saving to a missing destination fails', async () => {
    destStatus = 404;
    saveOk = false;
    const url = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(url.status).to.equal('error');
    expect(url.error).to.include(DEST);
  });

  it('reports an error when the save request is rejected', async () => {
    destStatus = 404;
    saveThrows = true;
    const url = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(url.status).to.equal('error');
    expect(url.error).to.include(DEST);
  });

  it('never overwrites when the destination cannot be read', async () => {
    destStatus = 500;
    const url = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(url.status).to.equal('error');
    expect(url.error).to.include(DEST);
    expect(saved).to.be.undefined;
  });

  it('reports an error when the save fails', async () => {
    saveOk = false;
    destHtml = toPage('<p>A</p>');
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B</p>');
    expect(url.status).to.equal('error');
    expect(url.skipped).to.be.undefined;
  });

  it('does not change mergeCopy output', async () => {
    destHtml = toPage('<p>A</p><p>B local</p>');
    await rollout(mergeCopy, '<p>A</p><p>B</p>');
    expect(saved).to.include('da-diff-added');
    expect(saved).to.not.include('rolloutbase');
  });
});
