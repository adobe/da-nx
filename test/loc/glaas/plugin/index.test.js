import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ORIGIN } from '../../../../nx/public/utils/constants.js';
import { getLivePreviewUrl } from '../../../../nx/utils/utils.js';
import {
  fetchPageHtml,
  buildImageRows,
  resolveAuthenticatedThumbnails,
  saveSelections,
} from '../../../../nx/blocks/loc/connectors/glaas/plugin/index.js';
import { parseSelections, writeSelections } from '../../../../nx/blocks/loc/connectors/glaas/imageSelections.js';

const ORG = 'test-org';
const SITE = 'test-site';
const PATH = '/some/page';
const TOKEN = 'test-token';
const SOURCE_URL = `${DA_ORIGIN}/source/${ORG}/${SITE}${PATH}.html`;

// Builds a fixture page via the real writeSelections rather than hand-typing da-metadata markup.
function pageWithImages(mainHtml, rows = []) {
  return writeSelections(`<body><main>${mainHtml}</main></body>`, rows);
}

describe('GLaaS loc-images plugin (companion util)', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('fetchPageHtml', () => {
    it('returns the page text with a bearer auth header on success', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response('<main>hi</main>', { status: 200 }));
      const result = await fetchPageHtml({
        org: ORG, site: SITE, path: PATH, token: TOKEN,
      });
      expect(result).to.equal('<main>hi</main>');
      expect(fetchStub.calledOnce).to.be.true;
      const [url, opts] = fetchStub.firstCall.args;
      expect(url).to.equal(SOURCE_URL);
      expect(opts.headers.Authorization).to.equal(`Bearer ${TOKEN}`);
    });

    it('returns null when the fetch is not ok', async () => {
      sinon.stub(window, 'fetch').resolves(new Response('', { status: 404 }));
      const result = await fetchPageHtml({
        org: ORG, site: SITE, path: PATH, token: TOKEN,
      });
      expect(result).to.equal(null);
    });
  });

  describe('buildImageRows', () => {
    it('builds one row per unique image, reflecting eligibility and existing marks', () => {
      const markedSrc = 'https://content.da.live/org/site/media_abc.png';
      const unmarkedSrc = 'https://content.da.live/org/site/media_def.jpg';
      const svgSrc = 'https://content.da.live/org/site/icon.svg';
      const html = pageWithImages(
        `<img src="${markedSrc}" alt="Hero"><img src="${unmarkedSrc}"><img src="${svgSrc}">`,
        [{ src: markedSrc, translate: 'true' }],
      );

      const rows = buildImageRows(html);
      expect(rows).to.have.length(3);

      const marked = rows.find((row) => row.src === markedSrc);
      expect(marked.checked).to.be.true;
      expect(marked.eligible).to.be.true;
      expect(marked.alt).to.equal('Hero');

      const unmarked = rows.find((row) => row.src === unmarkedSrc);
      expect(unmarked.checked).to.be.false;
      expect(unmarked.eligible).to.be.true;

      const svg = rows.find((row) => row.src === svgSrc);
      expect(svg.eligible).to.be.false;
      expect(svg.checked).to.be.false;
    });

    it('dedupes the same image appearing more than once on the page', () => {
      const src = 'https://content.da.live/org/site/media_abc.png';
      const html = `<body><main>
        <img src="${src}">
        <img src="${src}">
      </main></body>`;
      expect(buildImageRows(html)).to.have.length(1);
    });

    it('flags content.da.live and admin.da.live images as needing an authenticated fetch', () => {
      const daLiveSrc = 'https://content.da.live/org/site/media_abc.png';
      const adminSrc = 'https://admin.da.live/source/org/site/media_def.png';
      const aemPageSrc = 'https://main--site--org.aem.page/media_ghi.jpg';
      const html = `<body><main><img src="${daLiveSrc}"><img src="${adminSrc}"><img src="${aemPageSrc}"></main></body>`;

      const rows = buildImageRows(html);
      expect(rows.find((row) => row.src === daLiveSrc).needsAuthenticatedFetch).to.be.true;
      expect(rows.find((row) => row.src === adminSrc).needsAuthenticatedFetch).to.be.true;
      expect(rows.find((row) => row.src === aemPageSrc).needsAuthenticatedFetch).to.be.false;
    });

    it('rewrites an aem.page src thumbnail to preview.da.live and records its preview host', () => {
      const aemPageSrc = 'https://main--site--org.aem.page/media_abc.jpg';
      const html = `<body><main><img src="${aemPageSrc}"></main></body>`;

      const [row] = buildImageRows(html);
      expect(row.thumbnail).to.equal(`${getLivePreviewUrl('org', 'site', 'main')}/media_abc.jpg`);
      expect(row.previewHost).to.deep.equal({ ref: 'main', repo: 'site', org: 'org' });
    });
  });

  describe('resolveAuthenticatedThumbnails', () => {
    it('replaces a DA-internal row thumbnail with an object URL fetched using the bearer token', async () => {
      const daLiveSrc = 'https://content.da.live/org/site/media_abc.png';
      const blob = new Blob(['fake-image-bytes'], { type: 'image/png' });
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response(blob, { status: 200 }));

      const html = `<body><main><img src="${daLiveSrc}"></main></body>`;
      const rows = buildImageRows(html);
      await resolveAuthenticatedThumbnails(rows, TOKEN);

      expect(fetchStub.calledOnce).to.be.true;
      const [url, opts] = fetchStub.firstCall.args;
      expect(url).to.equal(daLiveSrc);
      expect(opts.headers.Authorization).to.equal(`Bearer ${TOKEN}`);
      expect(rows[0].thumbnail).to.match(/^blob:/);
    });

    it('leaves non-DA-internal rows untouched', async () => {
      const aemPageSrc = 'https://main--site--org.aem.page/media_abc.jpg';
      const fetchStub = sinon.stub(window, 'fetch');
      const html = `<body><main><img src="${aemPageSrc}"></main></body>`;
      const rows = buildImageRows(html);
      const originalThumbnail = rows[0].thumbnail;

      await resolveAuthenticatedThumbnails(rows, TOKEN);

      expect(fetchStub.called).to.be.false;
      expect(rows[0].thumbnail).to.equal(originalThumbnail);
    });

    it('falls back to the raw src when the authenticated fetch fails', async () => {
      const daLiveSrc = 'https://content.da.live/org/site/media_abc.png';
      sinon.stub(window, 'fetch').resolves(new Response('', { status: 401 }));

      const html = `<body><main><img src="${daLiveSrc}"></main></body>`;
      const rows = buildImageRows(html);
      await resolveAuthenticatedThumbnails(rows, TOKEN);

      expect(rows[0].thumbnail).to.equal(daLiveSrc);
    });
  });

  describe('saveSelections', () => {
    function stubServerHtml(getCurrentHtml, { onSave } = {}) {
      return sinon.stub(window, 'fetch').callsFake(async (url, opts = {}) => {
        if (String(url) !== SOURCE_URL) return new Response('', { status: 404 });
        if (opts.method === 'POST') {
          await onSave?.(opts);
          return new Response('', { status: 200 });
        }
        return new Response(getCurrentHtml(), { status: 200 });
      });
    }

    it('marks a previously-unmarked image true and saves it', async () => {
      const src = 'https://content.da.live/org/site/media_abc.png';
      const initialHtml = `<body><main><img src="${src}"></main></body>`;
      let savedHtml;
      stubServerHtml(() => initialHtml, {
        onSave: async (opts) => {
          savedHtml = await opts.body.get('data').text();
        },
      });

      const initialRows = buildImageRows(initialHtml);
      const currentRows = initialRows.map((row) => ({ ...row, checked: true }));

      const result = await saveSelections({
        org: ORG, site: SITE, path: PATH, token: TOKEN, initialRows, currentRows,
      });

      expect(result.ok).to.be.true;
      expect(parseSelections(savedHtml).has(src)).to.be.true;
    });

    it('preserves a concurrent change to a different image made by another session', async () => {
      const srcA = 'https://content.da.live/org/site/a.png';
      const srcB = 'https://content.da.live/org/site/b.png';
      const initialHtml = pageWithImages(`<img src="${srcA}"><img src="${srcB}">`);
      // By the time we save, someone else has already marked B true server-side.
      const latestHtml = pageWithImages(
        `<img src="${srcA}"><img src="${srcB}">`,
        [{ src: srcB, translate: 'true' }],
      );

      let savedHtml;
      stubServerHtml(() => latestHtml, {
        onSave: async (opts) => {
          savedHtml = await opts.body.get('data').text();
        },
      });

      const initialRows = buildImageRows(initialHtml);
      // This session only marks A true; never touches B.
      const currentRows = initialRows.map((row) => (
        row.src === srcA ? { ...row, checked: true } : row
      ));

      await saveSelections({
        org: ORG, site: SITE, path: PATH, token: TOKEN, initialRows, currentRows,
      });

      const saved = parseSelections(savedHtml);
      expect(saved.has(srcA)).to.be.true;
      expect(saved.has(srcB)).to.be.true;
    });

    it('prunes a previously-marked image that has since been removed from the page', async () => {
      const srcA = 'https://content.da.live/org/site/a.png';
      const srcDeleted = 'https://content.da.live/org/site/deleted.png';
      const initialHtml = pageWithImages(`<img src="${srcA}">`);
      // srcDeleted was marked true previously but the <img> is gone from the page now.
      const latestHtml = pageWithImages(
        `<img src="${srcA}">`,
        [{ src: srcDeleted, translate: 'true' }],
      );

      let savedHtml;
      stubServerHtml(() => latestHtml, {
        onSave: async (opts) => {
          savedHtml = await opts.body.get('data').text();
        },
      });

      const initialRows = buildImageRows(initialHtml);
      const currentRows = initialRows.map((row) => ({ ...row, checked: true }));

      await saveSelections({
        org: ORG, site: SITE, path: PATH, token: TOKEN, initialRows, currentRows,
      });

      const saved = parseSelections(savedHtml);
      expect(saved.has(srcA)).to.be.true;
      expect(saved.has(srcDeleted)).to.be.false;
    });

    it('returns an error when the latest page content cannot be fetched', async () => {
      sinon.stub(window, 'fetch').resolves(new Response('', { status: 404 }));
      const result = await saveSelections({
        org: ORG, site: SITE, path: PATH, token: TOKEN, initialRows: [], currentRows: [],
      });
      expect(result.error).to.be.a('string');
    });
  });
});
