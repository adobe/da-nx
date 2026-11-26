import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { copyMediaToClipboard } from '../../../nx/blocks/media-library/core/export.js';
import { DA_ADMIN, DA_CONTENT } from '../../../nx/utils/utils.js';

describe('media authoring URLs', () => {
  const namedUrl = 'https://main--site--org.aem.page/media/logo.svg';
  const sourceUrl = `${DA_ADMIN}/source/org/site/media/logo.svg`;
  const contentUrl = `${DA_CONTENT}/org/site/media/logo.svg`;
  let originalHref;
  let fetchStub;
  let writeStub;
  let writeTextStub;

  beforeEach(() => {
    originalHref = window.location.href;
    window.history.replaceState({}, '', '/apps/media-library');
    fetchStub = sinon.stub(window, 'fetch').callsFake(async () => new Response('image', {
      headers: { 'content-type': 'image/png' },
    }));
    writeStub = sinon.stub(navigator.clipboard, 'write').resolves();
    writeTextStub = sinon.stub(navigator.clipboard, 'writeText').resolves();
  });

  afterEach(() => {
    sinon.restore();
    window.history.replaceState({}, '', originalHref);
  });

  async function copiedHtml() {
    const [item] = writeStub.lastCall.args[0];
    return (await item.getType('text/html')).text();
  }

  it('uses a verified DA source for same-site named images without changing index metadata', async () => {
    const urls = [
      namedUrl,
      namedUrl.replace('.aem.page', '.aem.live'),
      namedUrl.replace('.aem.page', '.preview.da.live'),
      namedUrl.replace('.aem.page', '.hlx.page'),
      '/media/logo.svg',
    ];
    fetchStub.withArgs(sourceUrl).callsFake(async () => new Response(null, {
      headers: { 'content-type': 'image/svg+xml' },
    }));

    for (const url of urls) {
      const media = { url, displayName: 'logo.svg' };
      const result = await copyMediaToClipboard(media, 'org', 'site');
      expect(result.heading).to.equal('Copied');
      expect(await copiedHtml()).to.equal(`<img src="${contentUrl}">`);
      expect(media.url).to.equal(url);
    }
    const sourceCalls = fetchStub.getCalls().filter(({ args }) => args[0] === sourceUrl);
    expect(sourceCalls.length).to.equal(urls.length);
    sourceCalls.forEach(({ args }) => {
      expect(args[1]).to.include({ method: 'HEAD', cache: 'no-store' });
    });
  });

  it('leaves hashed images, external images, and non-image links unchanged without source checks', async () => {
    const urls = [
      'https://main--site--org.aem.page/media_123abc.svg#width=100&height=50',
      'https://example.com/org/site/logo.svg',
      'https://main--other--org.aem.page/media/logo.svg',
    ];
    for (const url of urls) {
      await copyMediaToClipboard({ url }, 'org', 'site');
      expect(await copiedHtml()).to.equal(`<img src="${url.replaceAll('&', '&amp;')}">`);
    }
    const pdfUrl = 'https://main--site--org.aem.page/media/guide.pdf';
    await copyMediaToClipboard({ url: pdfUrl }, 'org', 'site');
    expect(writeTextStub.calledOnceWithExactly(pdfUrl)).to.equal(true);
    expect(fetchStub.getCalls().some(({ args }) => args[1]?.method === 'HEAD')).to.equal(false);
  });

  it('preserves code-only image URLs when the corresponding DA source is absent', async () => {
    fetchStub.withArgs(sourceUrl).resolves(new Response(null, { status: 404 }));
    await copyMediaToClipboard({ url: namedUrl }, 'org', 'site');
    expect(await copiedHtml()).to.equal(`<img src="${namedUrl}">`);
    expect(fetchStub.firstCall.args[0]).to.equal(sourceUrl);
  });

  it('reports source verification failures instead of copying an unverified URL', async () => {
    sinon.stub(console, 'error');
    for (const status of [403, 503]) {
      fetchStub.withArgs(sourceUrl).resolves(new Response(null, { status }));
      const result = await copyMediaToClipboard({ url: namedUrl }, 'org', 'site');
      expect(result.heading).to.equal('Error');
      expect(result.message).to.include(String(status));
    }
    expect(writeStub.called).to.equal(false);
    expect(writeTextStub.called).to.equal(false);
  });

  it('reports network failures while verifying the source', async () => {
    sinon.stub(console, 'error');
    fetchStub.withArgs(sourceUrl).rejects(new TypeError('Network unavailable'));
    const result = await copyMediaToClipboard({ url: namedUrl }, 'org', 'site');
    expect(result.heading).to.equal('Error');
    expect(writeStub.called).to.equal(false);
  });

  it('refuses a source response that is not an image', async () => {
    sinon.stub(console, 'error');
    fetchStub.withArgs(sourceUrl).resolves(new Response(null, {
      headers: { 'content-type': 'text/html' },
    }));
    const result = await copyMediaToClipboard({ url: namedUrl }, 'org', 'site');
    expect(result.heading).to.equal('Error');
    expect(writeStub.called).to.equal(false);
  });
});
