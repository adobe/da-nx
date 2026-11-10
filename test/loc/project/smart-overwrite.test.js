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
  let versionLabels;
  let siteConfig;
  let sourceReads;
  let siteConfigStatus;
  let postedTo;
  let destReads;

  beforeEach(() => {
    versionLabels = [];
    siteConfig = { config: { data: [{ key: 'rollout.conflict.behavior', value: 'merge, smart-overwrite' }] } };
    siteConfigStatus = 200;
    sourceReads = [];
    postedTo = [];
    destReads = [];
    originalFetch = globalThis.fetch;
    saved = undefined;
    versionSaves = 0;
    destStatus = 200;
    saveOk = true;
    saveThrows = false;
    globalThis.fetch = sinon.stub().callsFake(async (url, opts = {}) => {
      const headers = new Headers({ 'x-da-actions': 'read=true' });
      if (opts.method === 'POST' && url.includes('/source/')) postedTo.push(url);
      if (opts.method === 'POST' && url.includes(`/source${DEST}`)) {
        if (saveThrows) throw new Error('network');
        saved = await opts.body.get('data').text();
        return { ok: saveOk, status: saveOk ? 200 : 500, headers, json: async () => ({}), text: async () => '' };
      }
      if (opts.method && opts.method !== 'GET') {
        if (url.includes('/versionsource/')) {
          versionSaves += 1;
          versionLabels.push(JSON.parse(opts.body).label);
        }
        return { ok: true, status: 200, headers, text: async () => '' };
      }
      if (url.endsWith('/source/org/site/live.html')) {
        const html = sourceReads.shift();
        return { ok: true, status: 200, headers, text: async () => html };
      }
      if (siteConfig && url.endsWith('/source/org/site/.da/translate.json')) {
        const ok = siteConfigStatus === 200;
        return { ok, status: siteConfigStatus, headers, json: async () => siteConfig };
      }
      if (url.endsWith(`/source${DEST}`)) {
        if (destReads.length) destHtml = destReads.shift();
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

  const expectFirstMerge = async (url, sourceMain) => {
    expect(url.status).to.equal('success');
    expect(saved).to.include('<p da-diff-added="">B local</p>');
    expect(saved).to.include('<da-diff-deleted><p>B global</p></da-diff-deleted>');
    const hashes = await hashesOf(sourceMain);
    expect(saved).to.include(`<div>rolloutbase</div><div>/org/site/apac/page.html|${hashes.join(',')}</div>`);
  };

  // Keeps the local side of every difference, like an author resolving the review in DA.
  const keepLocal = (html) => html
    .replace(/<da-diff-deleted>[\s\S]*?<\/da-diff-deleted>/g, '')
    .replaceAll(' da-diff-added=""', '');

  it('merges like today on the first run and records the base', async () => {
    destHtml = toPage('<p>A</p><p>B local</p>');
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
    await expectFirstMerge(url, '<p>A</p><p>B global</p>');
    expect(versionSaves).to.equal(1);
  });

  it('applies global changes made after the first run review is resolved', async () => {
    destHtml = toPage('<p>A</p><p>B local</p><p>C</p>');
    await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p><p>C</p>');
    destHtml = keepLocal(saved);
    await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p><p>C2</p>');
    expect(saved).to.include('<p>A</p><p>B local</p><p>C2</p>');
    expect(saved).to.not.include('da-diff');
    expect(versionSaves).to.equal(2);
  });

  it('keeps showing pending global changes while the first run review is unresolved', async () => {
    destHtml = toPage('<p>A</p><p>B local</p>');
    await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
    destHtml = saved;
    await expectFirstMerge(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
  });

  it('clears a stale review when upstream now matches the local content', async () => {
    destHtml = toPage('<p>A</p><p>B local</p>');
    await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
    destHtml = saved;
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B local</p>');
    expect(url.status).to.equal('success');
    expect(saved).to.include('<main><div><p>A</p><p>B local</p></div></main>');
    expect(saved).to.not.include('da-diff');
    expect(saved).to.not.include('B global');
  });

  it('adds new global changes to an unresolved first run review', async () => {
    destHtml = toPage('<p>A</p><p>B local</p><p>C</p>');
    await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p><p>C</p>');
    destHtml = saved;
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p><p>C2</p>');
    expect(url.status).to.equal('success');
    expect(saved).to.include('<da-diff-deleted><p>B global</p></da-diff-deleted>');
    expect(saved).to.include('<p da-diff-added="">B local</p>');
    expect(saved).to.include('C2');
    const hashes = await hashesOf('<p>A</p><p>B global</p><p>C2</p>');
    expect(saved).to.include(`/org/site/apac/page.html|${hashes.join(',')}`);
  });

  it('keeps whitespace-sensitive content exactly as-is on the first run', async () => {
    const code = '<pre><code>line 1\n    indented  line 2</code></pre>';
    destHtml = toPage(code);
    await rollout(smartOverwriteCopy, code);
    expect(saved).to.include(code);
  });

  it('keeps whitespace-sensitive content and metadata on later rollouts', async () => {
    const code = '<pre><code>line 1\n    indented  line 2</code></pre>';
    const meta = '<div class="da-metadata"><div><div>label</div><div>Two  spaces</div></div></div>';
    destHtml = toPage(`<p>A</p>${code}`, meta);
    await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(saved).to.include('<div>Two  spaces</div>');
    destHtml = keepLocal(saved);
    await rollout(smartOverwriteCopy, '<p>A2</p>');
    expect(saved).to.include('<p>A2</p>');
    expect(saved).to.include(code);
    expect(saved).to.include('<div>Two  spaces</div>');
  });

  it('keeps destination links exactly as authored on later rollouts', async () => {
    const link = '<p><a href="https://main--site--org.aem.page/local">Local</a></p>';
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage(`<p>A</p>${link}`, baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    await rollout(smartOverwriteCopy, '<p>A2</p><p>B</p>');
    expect(saved).to.include('<p>A2</p>');
    expect(saved).to.include('https://main--site--org.aem.page/local');
  });

  it('keeps empty anchor paragraphs on later rollouts', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p id="anchor"></p><p>A</p><p>B</p>', baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    await rollout(smartOverwriteCopy, '<p>A</p><p>B2</p>');
    expect(saved).to.include('<p id="anchor"></p><p>A</p><p>B2</p>');
  });

  it('reads a baseline value wrapped in a paragraph or whitespace', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    const meta = `<div class="da-metadata"><div><div>rolloutbase</div><div>\n  <p>/org/site/apac/page.html|${base.join(',')}</p>\n</div></div></div>`;
    destHtml = toPage('<p>A local</p><p>B</p>', meta);
    await rollout(smartOverwriteCopy, '<p>A</p><p>B2</p>');
    expect(saved).to.include('<p>A local</p><p>B2</p>');
    expect(saved).to.not.include('da-diff');
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

  it('shows a merge review when unresolved deletions are the only content', async () => {
    destHtml = toPage('<da-diff-deleted><p>Old</p></da-diff-deleted>');
    const url = await rollout(smartOverwriteCopy, '<p>A</p>');
    expect(url.status).to.equal('success');
    expect(saved).to.include('<da-diff-deleted><p>A</p></da-diff-deleted>');
    expect(saved).to.not.include('Old');
  });

  it('keeps an identical page exactly as authored on the first run', async () => {
    const page = '<body><main><div id="section"><p id="anchor"></p><p>A</p></div></main></body>';
    destHtml = page;
    const url = { source: '/org/site/page', destination: DEST, sourceContent: page };
    await smartOverwriteCopy(url, 'Proj');
    expect(url.status).to.equal('success');
    expect(saved).to.include('<div id="section"><p id="anchor"></p><p>A</p></div>');
    expect(saved).to.include('rolloutbase');
  });

  it('replaces old diff markers with a fresh review on the first run', async () => {
    destHtml = toPage('<p>A</p><p da-diff-added="">B local</p><da-diff-deleted><p>B old</p></da-diff-deleted>');
    await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
    expect(saved).to.include('<p da-diff-added="">B local</p>');
    expect(saved).to.include('<da-diff-deleted><p>B global</p></da-diff-deleted>');
    expect(saved).to.not.include('B old');
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

  it('falls back to a merge when the recorded base is for another page', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow(`/org/site/page|${base.join(',')}`));
    await expectFirstMerge(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
  });

  it('uses an empty recorded base instead of falling back to a merge', async () => {
    destHtml = toPage('<p>Local</p>', baseRow('/org/site/apac/page.html|'));
    const url = await rollout(smartOverwriteCopy, '<p>New</p>');
    expect(saved).to.not.include('da-diff');
    expect(saved).to.include('<div><p>Local</p></div><div><p>New</p></div>');
    expect(url.skipped).to.equal(0);
  });

  it('falls back to a merge when the recorded base is malformed', async () => {
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow('/org/site/apac/page.html|not-a-hash'));
    await expectFirstMerge(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
  });

  it('falls back to a merge when the recorded base is for an index page with the same base path', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow(`/org/site/apac/page/index.html|${base.join(',')}`));
    await expectFirstMerge(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
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
    expect(saved).to.be.undefined;
  });

  it('writes nothing and saves no version when nothing changed upstream since the last rollout', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p>A local</p><p>B</p>', baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B</p>');
    expect(url.status).to.equal('success');
    expect(url.skipped).to.equal(0);
    expect(saved).to.be.undefined;
    expect(versionSaves).to.equal(0);
  });

  it('writes nothing when an upstream reorder cannot be applied over local edits', async () => {
    const base = await hashesOf('<p>A</p><p>B</p><p>C</p>');
    destHtml = toPage('<p>A local</p><p>B</p><p>C</p>', baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    const url = await rollout(smartOverwriteCopy, '<p>B</p><p>A</p><p>C</p>');
    expect(url.status).to.equal('success');
    expect(url.skipped).to.equal(0);
    expect(saved).to.be.undefined;
    expect(versionSaves).to.equal(0);
  });

  it('still shows the review when nothing changed upstream but the review is unresolved', async () => {
    const base = await hashesOf('<p>A</p><p>B global</p>');
    destHtml = toPage('<p>A</p><p da-diff-added="">B local</p><da-diff-deleted><p>B global</p></da-diff-deleted>', baseRow(`/org/site/apac/page.html|${base.join(',')}`));
    await expectFirstMerge(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
  });

  it('never saves when the source has no main element', async () => {
    destHtml = toPage('<p>A local</p>');
    const url = { source: '/org/site/page', destination: DEST, sourceContent: '<body><p>Unexpected</p></body>' };
    await smartOverwriteCopy(url, 'Proj');
    expect(url.status).to.equal('error');
    expect(saved).to.be.undefined;
  });

  it('reports an error for an empty successful destination response', async () => {
    destHtml = '';
    const url = await rollout(smartOverwriteCopy, '<p>A</p>');
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
    expect(url.status).to.equal('success');
    expect(saved).to.include('divider');
    expect(saved).to.include('da-diff');
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

  it('falls back to a merge when the recorded base has extra fields', async () => {
    const base = await hashesOf('<p>A</p><p>B</p>');
    destHtml = toPage('<p>A</p><p>B local</p>', baseRow(`/org/site/apac/page.html|${base.join(',')}|junk`));
    await expectFirstMerge(await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>'), '<p>A</p><p>B global</p>');
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

  it('does nothing on a site that no longer opts into smart overwrite', async () => {
    siteConfig = undefined;
    destHtml = toPage('<p>A</p>');
    const url = await rollout(smartOverwriteCopy, '<p>A2</p>');
    expect(url.status).to.equal('error');
    expect(saved).to.be.undefined;
  });

  it('does not change mergeCopy output', async () => {
    destHtml = toPage('<p>A</p><p>B local</p>');
    await rollout(mergeCopy, '<p>A</p><p>B</p>');
    expect(saved).to.include('da-diff-added');
    expect(saved).to.not.include('rolloutbase');
  });
  const optIn = () => {
    siteConfig = { config: { data: [{ key: 'rollout.conflict.behavior', value: 'merge, overwrite, smart-overwrite' }] } };
  };
  const pageUrl = (sourceMain) => ({ source: '/org/site/page', destination: DEST, sourceContent: toPage(sourceMain) });
  const baseOf = async (main) => `/org/site/apac/page.html|${(await hashesOf(main)).join(',')}`;

  describe('outcome', () => {
    const withBase = async (main, baseMain) => toPage(main, baseRow(`/org/site/apac/page.html|${(await hashesOf(baseMain)).join(',')}`));

    it('reports a first run that differs as needing review', async () => {
      destHtml = toPage('<p>A</p><p>B local</p>');
      const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
      expect(url.outcome).to.equal('review');
    });

    it('keeps reporting review while the review is unresolved', async () => {
      destHtml = toPage('<p>A</p><p da-diff-added="">B local</p><da-diff-deleted><p>B global</p></da-diff-deleted>');
      const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
      expect(url.outcome).to.equal('review');
    });

    it('reports a page with nothing new upstream as unchanged', async () => {
      destHtml = await withBase('<p>A local</p><p>B</p>', '<p>A</p><p>B</p>');
      const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B</p>');
      expect(url.outcome).to.equal('unchanged');
      expect(saved).to.be.undefined;
    });

    it('reports nothing when upstream changes are applied or a page is copied or kept', async () => {
      destHtml = await withBase('<p>A local</p><p>B</p>', '<p>A</p><p>B</p>');
      expect((await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>')).outcome).to.be.undefined;
      destHtml = toPage('<p>A</p>');
      expect((await rollout(smartOverwriteCopy, '<p>A</p>')).outcome).to.be.undefined;
      destStatus = 404;
      expect((await rollout(smartOverwriteCopy, '<p>A</p>')).outcome).to.be.undefined;
    });

    it('reports nothing once a stale review is cleared by upstream', async () => {
      destHtml = toPage('<p>A</p><p da-diff-added="">B local</p><da-diff-deleted><p>B global</p></da-diff-deleted>');
      const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B local</p>');
      expect(saved).to.not.include('da-diff');
      expect(url.outcome).to.be.undefined;
    });

    it('clears an earlier outcome, also when the next rollout fails', async () => {
      destHtml = await withBase('<p>A</p>', '<p>A</p>');
      const url = { source: '/org/site/page', destination: DEST, sourceContent: toPage('<p>A</p>') };
      await smartOverwriteCopy(url, 'Proj');
      expect(url.outcome).to.equal('unchanged');
      destStatus = 500;
      await smartOverwriteCopy(url, 'Proj');
      expect(url.status).to.equal('error');
      expect(url.outcome).to.be.undefined;
    });
  });

  describe('markInSync', () => {
    it('records the parent as the baseline without changing the page', async () => {
      optIn();
      destHtml = toPage('<p>A local</p><p>B</p>', '<div class="da-metadata"><div><div>label</div><div>Two  spaces</div></div></div>');
      const url = pageUrl('<p>A</p><p>B</p>');
      await engine.markInSync(url);
      expect(url).to.include({ status: 'success', sync: 'marked' });
      expect(saved).to.include('<main><div><p>A local</p><p>B</p></div></main>');
      expect(saved).to.include('<div>Two  spaces</div>');
      expect(saved).to.include(`<div>rolloutbase</div><div>${await baseOf('<p>A</p><p>B</p>')}</div>`);
      expect(versionLabels).to.deep.equal(['Sync point set']);
    });

    it('lets the next smart rollout apply only later parent edits', async () => {
      optIn();
      destHtml = toPage('<p>A local</p><p>B</p><p>C</p>');
      await engine.markInSync(pageUrl('<p>A</p><p>B</p><p>C</p>'));
      destHtml = saved;
      const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B</p><p>C2</p>');
      expect(saved).to.include('<p>A local</p><p>B</p><p>C2</p>');
      expect(saved).to.not.include('da-diff');
      expect(url.skipped).to.equal(0);
    });

    it('keeps an edit the author saved while the source was being checked', async () => {
      optIn();
      destReads = [toPage('<p>A local</p>'), toPage('<p>A local, edited</p>')];
      await engine.markInSync(pageUrl('<p>A</p>'));
      expect(saved).to.include('<p>A local, edited</p>');
      expect(saved).to.include('rolloutbase');
    });

    it('keeps a full document page as a full document', async () => {
      optIn();
      destHtml = '<!DOCTYPE html>\n<html lang="fr"><head><title>T</title></head><body><main><div><p>A local</p></div></main></body></html>';
      await engine.markInSync(pageUrl('<p>A</p>'));
      expect(saved.startsWith('<!DOCTYPE html>\n<html lang="fr"><head><title>T</title></head><body><main><div><p>A local</p></div></main>')).to.be.true;
      expect(saved).to.include('rolloutbase');
    });

    it('keeps head content when the html tag is omitted', async () => {
      optIn();
      destHtml = '<!doctype html><head><title>T</title></head><body><main><div><p>A local</p></div></main></body>';
      await engine.markInSync(pageUrl('<p>A</p>'));
      expect(saved).to.include('<title>T</title>');
      expect(saved.startsWith('<!DOCTYPE html>')).to.be.true;
    });

    it('keeps head content when the html and head tags are omitted', async () => {
      optIn();
      destHtml = '<title>Local title</title><body><main><div><p>A local</p></div></main></body>';
      await engine.markInSync(pageUrl('<p>A</p>'));
      expect(saved).to.include('<title>Local title</title>');
    });

    it('keeps everything else on the page exactly as authored', async () => {
      optIn();
      destHtml = '<body><header><p>H</p></header><main id="local"><div class="x"><p>A local</p></div></main><div class="da-metadata"><div><div>label</div><div><p>Keep</p></div></div></div><footer><p>F</p></footer></body>';
      await engine.markInSync(pageUrl('<p>A</p>'));
      const value = await baseOf('<p>A</p>');
      expect(saved).to.equal(`<body><header><p>H</p></header><main id="local"><div class="x"><p>A local</p></div></main><div class="da-metadata"><div><div>label</div><div><p>Keep</p></div></div><div><div>rolloutbase</div><div>${value}</div></div></div><footer><p>F</p></footer></body>`);
    });

    it('skips snapshot pages', async () => {
      optIn();
      const url = { source: '/org/site/.snapshots/s1/page.html', destination: '/org/site/.snapshots/s1/apac/page.html' };
      await engine.markInSync(url);
      expect(url.sync).to.equal('snapshot');
      expect(saved).to.be.undefined;
    });

    it('replaces every stale baseline row with one', async () => {
      optIn();
      const stale = '<div><div>rolloutbase</div><div>stale</div></div>';
      destHtml = toPage('<p>A local</p><p>B</p>', `<div class="da-metadata">${stale}<div><div>label</div><div>L</div></div>${stale}</div>`);
      await engine.markInSync(pageUrl('<p>A</p><p>B</p>'));
      expect(saved.match(/rolloutbase/g)).to.have.length(1);
      expect(saved).to.include('<div><div>label</div><div>L</div></div>');
      destHtml = saved;
      const url = await rollout(smartOverwriteCopy, '<p>A</p><p>B2</p>');
      expect(saved).to.include('<p>A local</p><p>B2</p>');
      expect(saved).to.not.include('da-diff');
      expect(url.skipped).to.equal(0);
    });

    it('does not count a changed section wrapper as a local block', async () => {
      optIn();
      destHtml = '<body><main><div class="dark"><p>A</p></div></main></body>';
      const url = pageUrl('<p>A</p>');
      await engine.markInSync(url, { dryRun: true });
      expect(url).to.include({ sync: 'to-mark', differences: 0 });
    });

    it('counts repeated local blocks one for one in a dry run', async () => {
      optIn();
      destHtml = toPage('<p>A</p><p>A</p>');
      const url = pageUrl('<p>A</p>');
      await engine.markInSync(url, { dryRun: true });
      expect(url.differences).to.equal(1);
    });

    it('only counts in a dry run', async () => {
      optIn();
      destHtml = toPage('<p>A local</p><p>B</p>');
      const url = pageUrl('<p>A</p><p>B</p>');
      await engine.markInSync(url, { dryRun: true });
      expect(url).to.include({ status: 'success', sync: 'to-mark', differences: 1 });
      expect(saved).to.be.undefined;
      expect(versionSaves).to.equal(0);
    });

    [
      ['already has a baseline', async () => toPage('<p>A</p>', baseRow(await baseOf('<p>A</p>'))), 'in-sync'],
      ['has an unresolved review', async () => toPage('<p da-diff-added="">A</p><da-diff-deleted><p>B</p></da-diff-deleted>'), 'unresolved'],
      ['is empty', async () => toPage(''), 'missing'],
    ].forEach(([name, page, sync]) => {
      it(`skips a page that ${name}`, async () => {
        optIn();
        destHtml = await page();
        const url = pageUrl('<p>A2</p>');
        await engine.markInSync(url);
        expect(url).to.include({ status: 'success', sync });
        expect(saved).to.be.undefined;
      });
    });

    it('skips a missing page and a sheet', async () => {
      optIn();
      destStatus = 404;
      const missing = pageUrl('<p>A</p>');
      await engine.markInSync(missing);
      const sheet = { source: '/org/site/data.json', destination: '/org/site/apac/data.json' };
      await engine.markInSync(sheet);
      expect(missing.sync).to.equal('missing');
      expect(sheet.sync).to.equal('sheet');
      expect(saved).to.be.undefined;
    });

    it('does nothing on a site that has not opted into smart overwrite', async () => {
      siteConfig = undefined;
      destHtml = toPage('<p>A</p>');
      const url = pageUrl('<p>A</p>');
      await engine.markInSync(url);
      expect(url.status).to.equal('error');
      expect(saved).to.be.undefined;
    });

    it('never saves when the parent is malformed', async () => {
      optIn();
      destHtml = toPage('<p>A</p>');
      const url = { source: '/org/site/page', destination: DEST, sourceContent: '<body><main><p>Loose</p></main></body>' };
      await engine.markInSync(url);
      expect(url.status).to.equal('error');
      expect(saved).to.be.undefined;
    });
  });

  describe('plain rollouts on opted-in sites', () => {
    const merge = (sourceMain) => {
      const url = pageUrl(sourceMain);
      return engine.mergeCopy(url, 'Proj', { recordBaseline: true }).then(() => url);
    };

    it('record the baseline with a merge review', async () => {
      optIn();
      destHtml = toPage('<p>A</p><p>B local</p>');
      await merge('<p>A</p><p>B global</p>');
      expect(saved).to.include('da-diff-added');
      expect(saved).to.include(`<div>rolloutbase</div><div>${await baseOf('<p>A</p><p>B global</p>')}</div>`);
    });

    it('record the baseline from the same source revision the merge used', async () => {
      optIn();
      destHtml = toPage('<p>A</p>');
      sourceReads = [toPage('<p>A</p>'), toPage('<p>B</p>')];
      const url = { source: '/org/site/live.html', destination: DEST };
      await engine.mergeCopy(url, 'Proj', { recordBaseline: true });
      expect(saved).to.include(`<div>rolloutbase</div><div>${await baseOf('<p>A</p>')}</div>`);
      expect(sourceReads).to.have.length(1);
    });

    it('write nothing when the source read is empty', async () => {
      optIn();
      destHtml = toPage('<p>A</p>');
      sourceReads = ['', toPage('<p>A</p>'), toPage('<p>B</p>')];
      const url = { source: '/org/site/live.html', destination: DEST };
      await engine.mergeCopy(url, 'Proj', { recordBaseline: true });
      expect(url.status).to.equal('error');
      expect(saved).to.be.undefined;
      expect(sourceReads).to.have.length(2);
    });

    it('write nothing when the baseline on an unchanged page is already current', async () => {
      optIn();
      destHtml = toPage('<p>A</p>', baseRow(await baseOf('<p>A</p>')));
      const url = await merge('<p>A</p>');
      expect(url.status).to.equal('success');
      expect(saved).to.be.undefined;
    });

    it('record the baseline on an unchanged page that has other metadata', async () => {
      optIn();
      destHtml = toPage('<p>A</p>', '<div class="da-metadata"><div><div>label</div><div>L</div></div></div>');
      await merge('<p>A</p>');
      expect(saved).to.include('<main><div><p>A</p></div></main>');
      expect(saved).to.include('<div><div>label</div><div>L</div></div>');
      expect(saved).to.include(`<div>rolloutbase</div><div>${await baseOf('<p>A</p>')}</div>`);
      expect(versionSaves).to.equal(0);
    });

    it('record the baseline when a merge creates a missing page', async () => {
      optIn();
      destStatus = 404;
      await merge('<p>A</p>');
      expect(saved).to.include('<main><div><p>A</p></div></main>');
      expect(saved).to.include(`<div>rolloutbase</div><div>${await baseOf('<p>A</p>')}</div>`);
    });

    it('fall back to a plain overwrite when the source cannot be hashed', async () => {
      optIn();
      destHtml = toPage('<p>A</p>');
      const sourceContent = '<body><main><p>Loose</p></main></body>';
      const url = { source: '/org/site/page', destination: DEST, sourceContent };
      await engine.overwriteCopy(url, 'Proj', { recordBaseline: true });
      expect(url.status).to.equal('success');
      expect(saved).to.equal(sourceContent);
    });

    it('keep the exact source on an overwrite without the opt-in', async () => {
      siteConfig = undefined;
      destHtml = toPage('<p>A</p>');
      const url = pageUrl('<p>B</p>');
      await engine.overwriteCopy(url, 'Proj', { recordBaseline: true });
      expect(saved).to.equal(toPage('<p>B</p>'));
    });

    it('keep the source page as authored on an overwrite and only add the baseline', async () => {
      optIn();
      destHtml = toPage('<p>Old</p>');
      const sourceContent = '<body><header><p>H</p></header><main id="custom"><div><p>A</p></div></main><div class="da-metadata"><div><div>label</div><div>L</div></div><div><div>rejectedhashes</div><div>abc</div></div></div><footer></footer></body>';
      const url = { source: '/org/site/page', destination: DEST, sourceContent };
      await engine.overwriteCopy(url, 'Proj', { recordBaseline: true });
      const value = await baseOf('<p>A</p>');
      expect(saved).to.equal(`<body><header><p>H</p></header><main id="custom"><div><p>A</p></div></main><div class="da-metadata"><div><div>label</div><div>L</div></div><div><div>rolloutbase</div><div>${value}</div></div></div><footer></footer></body>`);
    });

    it('write to the exact destination path', async () => {
      optIn();
      const destination = '/org/site/a.html/page.html';
      await engine.overwriteCopy({ source: '/org/site/page', destination, sourceContent: toPage('<p>A</p>') }, 'Proj', { recordBaseline: true });
      expect(postedTo).to.deep.equal(['https://admin.da.live/source/org/site/a.html/page.html']);
    });

    it('fail without writing when the site config cannot be read', async () => {
      optIn();
      siteConfigStatus = 500;
      destHtml = toPage('<p>A</p>');
      const url = pageUrl('<p>B</p>');
      await engine.overwriteCopy(url, 'Proj', { recordBaseline: true });
      expect(url.status).to.equal('error');
      expect(saved).to.be.undefined;
    });

    it('clear an obsolete review even when the content now matches', async () => {
      optIn();
      destHtml = toPage('<p da-diff-added="">A</p><da-diff-deleted><p>Old</p></da-diff-deleted>', baseRow(await baseOf('<p>Old</p>')));
      await merge('<p>A</p>');
      expect(saved).to.include('<main><div><p>A</p></div></main>');
      expect(saved).to.not.include('da-diff');
      expect(saved).to.include(`<div>rolloutbase</div><div>${await baseOf('<p>A</p>')}</div>`);
    });

    it('drop a stale baseline when the new one cannot be computed', async () => {
      optIn();
      destHtml = toPage('<p>A</p><p>B</p>', baseRow(await baseOf('<p>A</p><p>B</p>')));
      const sourceContent = '<body><main>loose<div><p>A</p><p>B2</p></div></main></body>';
      await engine.mergeCopy({ source: '/org/site/page', destination: DEST, sourceContent }, 'Proj', { recordBaseline: true });
      expect(saved).to.include('da-diff');
      expect(saved).to.not.include('rolloutbase');
    });

    it('keep code whitespace so later upstream code edits apply', async () => {
      optIn();
      const code = (text) => `<pre><code>${text}</code></pre>`;
      destHtml = toPage(`<h1>H local</h1>${code('npm i\nnpm test')}`);
      await merge(`<h1>H</h1>${code('npm i\nnpm test')}`);
      expect(saved).to.include(code('npm i\nnpm test'));
      destHtml = keepLocal(saved);
      const url = await rollout(smartOverwriteCopy, `<h1>H</h1>${code('npm ci\nnpm test')}`);
      expect(saved).to.include(code('npm ci\nnpm test'));
      expect(url.skipped).to.equal(0);
    });

    it('keep whitespace-only local code differences on an unchanged page', async () => {
      optIn();
      destHtml = toPage('<pre><code>print("a  b")</code></pre>');
      await merge('<pre><code>print("a b")</code></pre>');
      expect(saved).to.include('<pre><code>print("a  b")</code></pre>');
      expect(saved).to.not.include('da-diff');
    });

    it('clear an obsolete review on a page without metadata', async () => {
      optIn();
      destHtml = toPage('<p da-diff-added="">A</p><da-diff-deleted><p>Old</p></da-diff-deleted>');
      await merge('<p>A</p>');
      expect(saved).to.include('<main><div><p>A</p></div></main>');
      expect(saved).to.not.include('da-diff');
    });

    it('record the baseline with an overwrite', async () => {
      optIn();
      destHtml = toPage('<p>A local</p>');
      const url = pageUrl('<p>A</p>');
      await engine.overwriteCopy(url, 'Proj', { recordBaseline: true });
      expect(saved).to.include('<main><div><p>A</p></div></main>');
      expect(saved).to.include(`<div>rolloutbase</div><div>${await baseOf('<p>A</p>')}</div>`);
    });

    it('record the baseline on an unchanged page without a new version', async () => {
      optIn();
      destHtml = toPage('<p>A</p>');
      const url = await merge('<p>A</p>');
      expect(url.status).to.equal('success');
      expect(saved).to.include('<main><div><p>A</p></div></main>');
      expect(saved).to.include(`<div>rolloutbase</div><div>${await baseOf('<p>A</p>')}</div>`);
      expect(versionSaves).to.equal(0);
    });

    it('keep a change rejected in a plain merge out of the next smart rollout', async () => {
      optIn();
      destHtml = toPage('<p>A</p><p>B</p>', baseRow(await baseOf('<p>A</p><p>B</p>')));
      await merge('<p>A</p><p>B global</p>');
      destHtml = keepLocal(saved);
      saved = undefined;
      await rollout(smartOverwriteCopy, '<p>A</p><p>B global</p>');
      expect(saved).to.be.undefined;
      const url = await rollout(smartOverwriteCopy, '<p>A2</p><p>B global</p>');
      expect(saved).to.include('<p>A2</p><p>B</p>');
      expect(url.skipped).to.equal(0);
    });

    it('do not record a baseline on a site that has not opted in', async () => {
      siteConfig = undefined;
      destHtml = toPage('<p>A</p><p>B local</p>');
      await merge('<p>A</p><p>B</p>');
      expect(saved).to.include('da-diff-added');
      expect(saved).to.not.include('rolloutbase');
    });

    it('do not record a baseline without the rollout flag', async () => {
      optIn();
      destHtml = toPage('<p>A</p><p>B local</p>');
      await rollout(mergeCopy, '<p>A</p><p>B</p>');
      expect(saved).to.include('da-diff-added');
      expect(saved).to.not.include('rolloutbase');
    });
  });
});
