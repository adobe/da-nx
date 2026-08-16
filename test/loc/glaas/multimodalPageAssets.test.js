import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN } from '../../../nx2/utils/utils.js';
import { glaasSourcePreviewUrl } from '../../../nx/blocks/loc/connectors/glaas/api.js';
import {
  buildMultimodalPageAssetEntry,
  buildMultimodalTextAsset,
  collectMultimodalImageUrls,
  collectMultimodalAssetNames,
  countMultimodalTranslatedPages,
  contentDaLiveToDaSourceUrl,
  createPutUrlRollingLimiter,
  getMultimodalV2TaskStatus,
  getPutUrlForFile,
  resetPutUrlRateLimitGateForTests,
  isV2AssetReady,
  uploadMultimodalPageAssets,
  v2AssetStatusFromProbe,
} from '../../../nx/blocks/loc/connectors/glaas/multimodalApi.js';
import { LOC_SRC_ATTR } from '../../../nx/blocks/loc/connectors/glaas/dnt.js';

describe('GLaaS multimodal getPutUrlForFile', () => {
  beforeEach(() => {
    resetPutUrlRateLimitGateForTests();
  });

  afterEach(() => {
    if (sinon.clock) sinon.clock.restore();
    sinon.restore();
    resetPutUrlRateLimitGateForTests();
  });

  it('retries on 429 using Retry-After before returning putURL', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let calls = 0;
      sinon.stub(window, 'fetch').callsFake(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve(new Response(JSON.stringify({}), {
            status: 429,
            headers: { 'Retry-After': '1' },
          }));
        }
        return Promise.resolve(new Response(
          JSON.stringify({ putURL: 'https://put.example/blob' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      });

      const promise = getPutUrlForFile({
        origin: 'https://glaas.example',
        clientid: 'client',
        token: 'token',
        assetName: '/drafts/demo/hero.png',
        maxRetries: 1,
      });
      await clock.runAllAsync();
      const result = await promise;

      expect(result.putURL).to.equal('https://put.example/blob');
      expect(calls).to.equal(2);
    } finally {
      clock.restore();
    }
  });

  it('uses default backoff when 429 has no readable rate-limit headers', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let calls = 0;
      sinon.stub(window, 'fetch').callsFake(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve(new Response(JSON.stringify({}), { status: 429 }));
        }
        return Promise.resolve(new Response(
          JSON.stringify({ putURL: 'https://put.example/blob' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      });

      const promise = getPutUrlForFile({
        origin: 'https://glaas.example',
        clientid: 'client',
        token: 'token',
        assetName: '/drafts/demo/hero.png',
        maxRetries: 1,
      });
      await clock.runAllAsync();
      const result = await promise;

      expect(result.putURL).to.equal('https://put.example/blob');
    } finally {
      clock.restore();
    }
  });

  it('retries on opaque fetch failure without a readable 429 response', async () => {
    const clock = sinon.useFakeTimers();
    try {
      const logRequest = sinon.spy();
      let calls = 0;
      sinon.stub(window, 'fetch').callsFake(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(new Response(
          JSON.stringify({ putURL: 'https://put.example/blob' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      });

      const promise = getPutUrlForFile({
        origin: 'https://glaas.example',
        clientid: 'client',
        token: 'token',
        assetName: '/drafts/demo/hero.png',
        logRequest,
        maxRetries: 1,
      });
      await clock.runAllAsync();
      const result = await promise;

      expect(result.putURL).to.equal('https://put.example/blob');
      expect(logRequest.calledWith('getPutURL-retry', sinon.match({
        status: 'fetch-error',
        waitMs: 30250,
      }))).to.be.true;
    } finally {
      clock.restore();
    }
  });

  it('retries after fetch error following a 429', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let calls = 0;
      sinon.stub(window, 'fetch').callsFake(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve(new Response(JSON.stringify({}), { status: 429 }));
        }
        if (calls === 2) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(new Response(
          JSON.stringify({ putURL: 'https://put.example/blob' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      });

      const promise = getPutUrlForFile({
        origin: 'https://glaas.example',
        clientid: 'client',
        token: 'token',
        assetName: '/drafts/demo/hero.png',
        maxRetries: 2,
      });
      await clock.runAllAsync();
      const result = await promise;

      expect(result.putURL).to.equal('https://put.example/blob');
      expect(calls).to.equal(3);
    } finally {
      clock.restore();
    }
  });

  it('computes window retry delay when the rolling per-minute budget is exhausted', async () => {
    const limiter = createPutUrlRollingLimiter({
      limitPerWindow: 2,
      windowMs: 60_000,
      minIntervalMs: 500,
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.windowRetryDelayMs()).to.be.above(0);
  });

  it('returns error when 429 persists after retries', async () => {
    const clock = sinon.useFakeTimers();
    try {
      sinon.stub(window, 'fetch').resolves(new Response(JSON.stringify({}), {
        status: 429,
        headers: { 'Retry-After': '1' },
      }));

      const promise = getPutUrlForFile({
        origin: 'https://glaas.example',
        clientid: 'client',
        token: 'token',
        assetName: '/drafts/demo/hero.png',
        maxRetries: 1,
      });
      await clock.runAllAsync();
      const result = await promise;

      expect(result.error).to.equal('Error getting put URL for file.');
      expect(result.status).to.equal(429);
    } finally {
      clock.restore();
    }
  });
});

describe('GLaaS multimodal source preview URL', () => {
  it('normalizes aem.page href for GLaaS (strip trailing /index)', () => {
    expect(glaasSourcePreviewUrl(
      'https://main--site--org.aem.page/drafts/demo/page/index',
    )).to.equal('https://main--site--org.aem.page/drafts/demo/page/');
    expect(glaasSourcePreviewUrl(
      'https://main--site--org.aem.page/drafts/demo/page.html',
    )).to.equal('https://main--site--org.aem.page/drafts/demo/page.html');
    expect(glaasSourcePreviewUrl(undefined)).to.equal(undefined);
  });
});

describe('GLaaS multimodal image source URLs', () => {
  it('maps content.da.live to DA Admin /source with the same path', () => {
    expect(contentDaLiveToDaSourceUrl(
      'https://content.da.live/adobecom/da-dc/acrobat/test/.acrobat-pro/rect.png',
    )).to.equal(
      `${DA_ADMIN}/source/adobecom/da-dc/acrobat/test/.acrobat-pro/rect.png`,
    );
  });
});

describe('GLaaS multimodal pageAssets', () => {
  const selectionsFor = (...srcs) => new Set(srcs.map((src) => new URL(src).href));

  it('builds page asset entry with html glaas name and image metadata', () => {
    const src = 'https://content.da.live/adobecom/foo/rectangle%20810724.png';
    const html = `
      <img src="${src}">
    `;
    const imageUrls = collectMultimodalImageUrls(html, { imageSelections: selectionsFor(src) });
    const entry = buildMultimodalPageAssetEntry({
      htmlAssetName: '/drafts/demo/page.html',
      imageUrls,
    });
    expect(entry.htmlGlaasName).to.equal('/drafts/demo/page.html');
    expect(entry.images).to.have.length(1);
    expect(entry.images[0].contentDaLiveUrl).to.include('rectangle%20810724.png');
    expect(entry.images[0].glaasName).to.equal('/rectangle 810724.png');
  });

  it('only collects images explicitly marked for translation (opt-in default)', () => {
    const markedSrc = 'https://content.da.live/adobecom/foo/same-site.png';
    const unmarkedSrc = 'https://content.da.live/adobecom/foo/unmarked.png';
    const html = `
      <img src="${markedSrc}">
      <img src="${unmarkedSrc}">
    `;
    const result = collectMultimodalImageUrls(html, { imageSelections: selectionsFor(markedSrc) });
    expect(result).to.deep.equal([markedSrc]);
  });

  it('excludes every image when nothing is marked, regardless of host', () => {
    const html = `
      <img src="https://content.da.live/adobecom/foo/same-site.png">
      <img src="https://main--site--org.aem.live/media_def.jpg">
    `;
    expect(collectMultimodalImageUrls(html, {})).to.deep.equal([]);
    expect(collectMultimodalImageUrls(html)).to.deep.equal([]);
  });

  it('ignores relative paths (DNT) even if somehow marked - only absolute http(s) is eligible', () => {
    const relativeSrc = './media_13f28848e8da34fafe003ee7053bf2118fb26c78a.jpg';
    const html = `<img src="${relativeSrc}">`;
    const imageSelections = new Set([relativeSrc]);
    expect(collectMultimodalImageUrls(html, { imageSelections })).to.deep.equal([]);
  });

  it('excludes svg even when marked', () => {
    const svgSrc = 'https://content.da.live/adobecom/da-dc/drafts/demo/.hero/variant=default,%20width=full,%20content=blur%20bg.svg';
    const html = `<img src="${svgSrc}">`;
    const imageSelections = selectionsFor(svgSrc);
    expect(collectMultimodalImageUrls(html, { imageSelections })).to.deep.equal([]);
  });

  it('collects comma-separated filenames from img[src] only, marked ones only, svg excluded', () => {
    const commaPng = 'https://content.da.live/adobecom/da-dc/drafts/demo/.hero/variant=default,%20width=full,%20content=feature%20image.png';
    const commaJpg = 'https://content.da.live/adobecom/da-dc/drafts/demo/.hero/breakpoint=small,%20width=full,%20content=hero%20photo.jpg';
    const commaSvg = 'https://content.da.live/adobecom/da-dc/drafts/demo/.hero/variant=default,%20width=full,%20content=blur%20bg.svg';
    const html = `
      <picture>
        <source srcset="${commaPng}">
        <source srcset="${commaPng}" media="(min-width: 600px)">
        <img src="${commaPng}" loading="lazy">
      </picture>
      <img src="${commaJpg}">
      <picture>
        <source srcset="${commaSvg}">
        <source srcset="${commaSvg}" media="(min-width: 600px)">
        <img src="${commaSvg}" loading="lazy">
      </picture>
    `;
    const marked = selectionsFor(commaPng, commaJpg, commaSvg);
    expect(collectMultimodalImageUrls(html, { imageSelections: marked })).to.deep.equal([
      commaPng,
      commaJpg,
    ]);
  });

  it('collects only png/jpeg marked images (GLaaS multimodal format support)', () => {
    const png = 'https://content.da.live/adobecom/foo/hero.png';
    const jpg = 'https://content.da.live/adobecom/foo/photo.jpg';
    const jpeg = 'https://content.da.live/adobecom/foo/photo.jpeg';
    const svg = 'https://content.da.live/adobecom/foo/blur.svg';
    const gif = 'https://content.da.live/adobecom/foo/anim.gif';
    const webp = 'https://content.da.live/adobecom/foo/modern.webp';
    const html = `
      <img src="${png}">
      <img src="${jpg}">
      <img src="${jpeg}">
      <img src="${svg}">
      <img src="${gif}">
      <img src="${webp}">
    `;
    const marked = selectionsFor(png, jpg, jpeg, svg, gif, webp);
    expect(collectMultimodalImageUrls(html, { imageSelections: marked })).to.deep.equal([
      png,
      jpg,
      jpeg,
    ]);
  });

  it('collects a marked image hosted anywhere, not just content.da.live', () => {
    const aemSrc = 'https://main--site--org.aem.live/media_def.jpg';
    const externalSrc = 'https://example.com/photo.jpg';
    const html = `
      <img src="${aemSrc}">
      <img src="${externalSrc}">
    `;
    const imageSelections = selectionsFor(aemSrc, externalSrc);
    const result = collectMultimodalImageUrls(html, { imageSelections });
    expect(result).to.deep.equal([aemSrc, externalSrc]);
  });

  it('collects a marked image via LOC_SRC_ATTR when DNT has relativized its src', () => {
    // Regression: dnt.js relativizes AEM-hosted media_* srcs, stashing the original
    // absolute href in LOC_SRC_ATTR for exactly this case - a relative src alone is
    // ineligible (not absolute http(s)), so without reading the attribute this marked
    // image would silently vanish from translation.
    const originalSrc = 'https://main--site--org.aem.live/media_abc.png';
    const html = `<img src="./media_abc.png" ${LOC_SRC_ATTR}="${originalSrc}">`;
    const imageSelections = selectionsFor(originalSrc);
    expect(collectMultimodalImageUrls(html, { imageSelections })).to.deep.equal([originalSrc]);
  });

  it('excludes a marked image if it is no longer present on the page', () => {
    const src = 'https://content.da.live/adobecom/foo/deleted.png';
    const html = '<p>No images here</p>';
    const imageSelections = selectionsFor(src);
    expect(collectMultimodalImageUrls(html, { imageSelections })).to.deep.equal([]);
  });

  it('returns empty images when page has no content.da.live assets', () => {
    const entry = buildMultimodalPageAssetEntry({
      htmlAssetName: 'drafts/page.html',
      imageUrls: [],
    });
    expect(entry.htmlGlaasName).to.equal('/drafts/page.html');
    expect(entry.images).to.deep.equal([]);
  });
});

describe('GLaaS multimodal TEXT asset metadata', () => {
  it('does not include langMetadata or languageContext on TEXT assets (carried via assetMetadataUrl instead)', () => {
    const asset = buildMultimodalTextAsset({
      pagePath: '/drafts/demo/page.html',
      signedUrl: 'https://put.example/html',
      targetLocales: ['de', 'fr'],
      pagePreviewUrl: 'https://main--site--org.aem.page/drafts/demo/page',
      translationMetadata: {
        de: { 'keywords|block_1_title': 'keyword de' },
      },
      languageContext: {
        de: {
          keywords: [{ sourceKeyword: 'gif file', targetKeywords: [{ keyword: 'GIF-Datei' }] }],
        },
      },
    });
    expect(asset).to.deep.equal({
      type: 'TEXT',
      name: '/drafts/demo/page.html',
      parentAsset: '/drafts/demo/page.html',
      signedUrl: 'https://put.example/html',
      targetLocales: ['de', 'fr'],
      sourcePreviewUrlPage: 'https://main--site--org.aem.page/drafts/demo/page',
    });
  });

  it('includes assetMetadataUrl when provided (GLaaS v2 requires it as its own file)', () => {
    const asset = buildMultimodalTextAsset({
      pagePath: '/drafts/demo/page.html',
      signedUrl: 'https://put.example/html',
      targetLocales: ['de'],
      assetMetadataUrl: 'https://put.example/metadata',
    });
    expect(asset.assetMetadataUrl).to.equal('https://put.example/metadata');
  });

  it('omits assetMetadataUrl when not provided', () => {
    const asset = buildMultimodalTextAsset({
      pagePath: '/drafts/demo/page.html',
      signedUrl: 'https://put.example/html',
      targetLocales: ['de'],
    });
    expect(asset).to.not.have.property('assetMetadataUrl');
  });
});

describe('GLaaS multimodal uploadMultimodalPageAssets', () => {
  beforeEach(() => {
    resetPutUrlRateLimitGateForTests();
  });

  afterEach(() => {
    sinon.restore();
    resetPutUrlRateLimitGateForTests();
  });

  it('uploads a metadata file and sets assetMetadataUrl on the TEXT asset', async () => {
    // Mirrors putUrlAssetName() in multimodalApi.js: leading slash stripped, '/' -> '-'.
    const putUrls = {
      'drafts-demo-page.html': 'https://put.example/html',
      'drafts-demo-page.metadata.json': 'https://put.example/metadata',
    };
    const putBodies = [];
    sinon.stub(window, 'fetch').callsFake((url, opts) => {
      if (typeof url === 'string' && url.includes('/getPutURLForFile/')) {
        const wireName = url.split('/getPutURLForFile/')[1];
        return Promise.resolve(new Response(
          JSON.stringify({ putURL: putUrls[wireName] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      }
      // PUT to a signed URL (html or metadata upload)
      putBodies.push({ url, body: opts.body });
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await uploadMultimodalPageAssets({
      origin: 'https://glaas.example',
      clientid: 'client',
      token: 'token',
      htmlAssetName: '/drafts/demo/page.html',
      htmlContent: '<p>hello</p>',
      targetLocales: ['de'],
    });

    expect(result.error).to.equal(undefined);
    expect(result.assets).to.have.length(1);
    expect(result.assets[0].type).to.equal('TEXT');
    expect(result.assets[0].signedUrl).to.equal('https://put.example/html');
    expect(result.assets[0].assetMetadataUrl).to.equal('https://put.example/metadata');

    const metadataPut = putBodies.find((call) => call.url === 'https://put.example/metadata');
    expect(metadataPut).to.exist;
    const metadataBody = JSON.parse(metadataPut.body);
    expect(metadataBody.assetName).to.equal('/drafts/demo/page.html');
    expect(metadataBody.assetType).to.equal('SOURCE');
    expect(metadataBody.targetLocales).to.deep.equal(['de']);
    expect(metadataBody).to.not.have.property('langMetadata');
    expect(metadataBody).to.not.have.property('languageContext');
  });

  it('includes langMetadata and languageContext in the metadata file when provided (v1.2 parity)', async () => {
    // Mirrors putUrlAssetName() in multimodalApi.js: leading slash stripped, '/' -> '-'.
    const putUrls = {
      'drafts-demo-page': 'https://put.example/html',
      'drafts-demo-page.metadata.json': 'https://put.example/metadata',
    };
    const putBodies = [];
    sinon.stub(window, 'fetch').callsFake((url, opts) => {
      if (typeof url === 'string' && url.includes('/getPutURLForFile/')) {
        const wireName = url.split('/getPutURLForFile/')[1];
        return Promise.resolve(new Response(
          JSON.stringify({ putURL: putUrls[wireName] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      }
      putBodies.push({ url, body: opts.body });
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    await uploadMultimodalPageAssets({
      origin: 'https://glaas.example',
      clientid: 'client',
      token: 'token',
      htmlAssetName: '/drafts/demo/page',
      htmlContent: '<p>hello</p>',
      targetLocales: ['de', 'fr'],
      translationMetadata: { de: { 'keywords|block_1_title': 'keyword de' } },
      languageContext: { de: { keywords: [] } },
    });

    // No .html extension on the source asset, so the metadata asset name is simply suffixed.
    const metadataPut = putBodies.find((call) => call.url === 'https://put.example/metadata');
    expect(metadataPut).to.exist;
    const metadataBody = JSON.parse(metadataPut.body);
    expect(metadataBody).to.deep.equal({
      assetName: '/drafts/demo/page',
      metadata: {},
      assetType: 'SOURCE',
      targetLocales: ['de', 'fr'],
      langMetadata: { de: { 'keywords|block_1_title': 'keyword de' } },
      languageContext: { de: { keywords: [] } },
    });
  });
});

describe('GLaaS multimodal v2 asset status', () => {
  beforeEach(() => {
    resetPutUrlRateLimitGateForTests();
  });

  it('treats 200 + signedURL as COMPLETED', () => {
    expect(isV2AssetReady({ status: 200, json: { signedURL: 'https://x' } })).to.equal(true);
    expect(isV2AssetReady({ status: 200, json: {} })).to.equal(false);
    expect(isV2AssetReady({ status: 404, json: {} })).to.equal(false);
  });

  it('maps v2 probe results to v1.2-style asset rows', () => {
    const ready = v2AssetStatusFromProbe('/drafts/page.html', {
      status: 200,
      json: { signedURL: 'https://x', assetType: 'TEXT' },
    });
    expect(ready).to.deep.equal({
      assetName: '/drafts/page.html',
      status: 'COMPLETED',
      assetType: 'TEXT',
    });

    const pending = v2AssetStatusFromProbe('media/a.png', { status: 404, json: {} });
    expect(pending.status).to.equal('NOT_FOUND');
    expect(pending.assetName).to.equal('/media/a.png');
  });

  it('collects html and image glaas names from pageAssets', () => {
    const names = collectMultimodalAssetNames({
      '/page': {
        htmlGlaasName: '/drafts/page.html',
        images: [{ glaasName: '/media/a.png' }],
      },
    });
    expect(names).to.deep.equal(['/drafts/page.html', '/media/a.png']);
  });

  it('returns 200 with IN_PROGRESS when v2 assets are not ready yet', async () => {
    sinon.stub(window, 'fetch').callsFake(() => Promise.resolve(new Response(
      JSON.stringify({}),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )));

    const result = await getMultimodalV2TaskStatus({
      service: { clientid: 'client', origin: 'https://glaas.example' },
      token: 'token',
      task: { name: 'task-1', workflow: 'Product/Project' },
      langs: [{ code: 'de' }],
      pageAssets: {
        '/page': {
          htmlGlaasName: '/drafts/page.html',
          images: [{ glaasName: '/media/a.png' }],
        },
      },
    });

    expect(result.status).to.equal(200);
    expect(result.json).to.have.length(1);
    expect(result.json[0].targetLocale).to.equal('de');
    expect(result.json[0].status).to.equal('IN_PROGRESS');
    expect(result.json[0].assets.every((asset) => asset.status !== 'COMPLETED')).to.equal(true);
  });

  it('returns IN_PROGRESS without throwing when a v2 probe request fails', async () => {
    sinon.stub(window, 'fetch').rejects(new TypeError('Failed to fetch'));

    const result = await getMultimodalV2TaskStatus({
      service: { clientid: 'client', origin: 'https://glaas.example' },
      token: 'token',
      task: { name: 'task-1', workflow: 'Product/Project' },
      langs: [{ code: 'de' }],
      pageAssets: {
        '/page': {
          htmlGlaasName: '/drafts/page.html',
          images: [{ glaasName: '/media/a.png' }],
        },
      },
    });

    expect(result.status).to.equal(200);
    expect(result.json[0].targetLocale).to.equal('de');
    expect(result.json[0].status).to.equal('IN_PROGRESS');
    expect(result.json[0].assets).to.deep.equal([]);
  });

  afterEach(() => {
    sinon.restore();
  });
});

describe('GLaaS multimodal translated page count', () => {
  const pageAssets = {
    '/page-a': {
      htmlGlaasName: '/drafts/page-a.html',
      images: [{ glaasName: '/media/a.png', contentDaLiveUrl: 'https://content.da.live/media/a.png' }],
    },
    '/page-b': {
      htmlGlaasName: '/drafts/page-b.html',
      images: [],
    },
  };

  it('counts a page only when html and all images are COMPLETED', () => {
    const assets = [
      { assetName: '/drafts/page-a.html', status: 'COMPLETED' },
      { assetName: '/media/a.png', status: 'IN_PROGRESS' },
      { assetName: '/drafts/page-b.html', status: 'COMPLETED' },
    ];
    expect(countMultimodalTranslatedPages(pageAssets, assets)).to.equal(1);
  });

  it('counts a page when html and every image are COMPLETED', () => {
    const assets = [
      { assetName: '/drafts/page-a.html', status: 'COMPLETED' },
      { assetName: '/media/a.png', status: 'COMPLETED' },
      { assetName: '/drafts/page-b.html', status: 'COMPLETED' },
    ];
    expect(countMultimodalTranslatedPages(pageAssets, assets)).to.equal(2);
  });

  it('normalizes asset names without a leading slash', () => {
    const assets = [
      { assetName: 'drafts/page-a.html', status: 'COMPLETED' },
      { assetName: 'media/a.png', status: 'COMPLETED' },
    ];
    expect(countMultimodalTranslatedPages({ '/page-a': pageAssets['/page-a'] }, assets)).to.equal(1);
  });

  it('returns 0 when pageAssets is missing', () => {
    const assets = [
      { assetName: '/drafts/page-a.html', status: 'COMPLETED' },
      { assetName: '/media/a.png', status: 'COMPLETED' },
    ];
    expect(countMultimodalTranslatedPages(undefined, assets)).to.equal(0);
  });

  it('counts one page when html and two images are all COMPLETED (not three assets)', () => {
    const singlePageAssets = {
      '/drafts/demo/page': {
        htmlGlaasName: '/drafts/demo/page.html',
        images: [
          { glaasName: '/media/hero.png' },
          { glaasName: '/media/report.png' },
        ],
      },
    };
    const assets = [
      { assetName: '/drafts/demo/page.html', status: 'COMPLETED' },
      { assetName: '/media/hero.png', status: 'COMPLETED' },
      { assetName: '/media/report.png', status: 'COMPLETED' },
    ];
    expect(countMultimodalTranslatedPages(singlePageAssets, assets)).to.equal(1);
    expect(assets.filter((asset) => asset.status === 'COMPLETED').length).to.equal(3);
  });
});
