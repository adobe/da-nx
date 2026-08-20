import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN } from '../../../nx2/utils/utils.js';
import {
  blobContentTypeForDaSource,
  buildTranslatedImageSourcePath,
  TRANSLATED_IMAGE_MAX_BYTES,
  saveTranslatedImageToDaSource,
  prepareMultimodalPageForSave,
  siteRelativePathFromImageUrl,
  rewriteContentDaLiveImageUrls,
  fetchMultimodalImage,
} from '../../../nx/blocks/loc/connectors/glaas/multimodalApi.js';
import { LOC_SRC_ATTR } from '../../../nx/blocks/loc/connectors/glaas/dnt.js';
import { DA_ETC } from '../../../nx/utils/utils.js';

describe('GLaaS multimodal save', () => {
  it('strips content.da.live org/site segments from image URL', () => {
    expect(siteRelativePathFromImageUrl(
      'https://content.da.live/adobecom/da-dc/acrobat/online/test/.acrobat-pro/report.png',
    )).to.equal('/acrobat/online/test/.acrobat-pro/report.png');
  });

  it('uses the full pathname for non-content.da.live hosts (no org/site prefix)', () => {
    expect(siteRelativePathFromImageUrl(
      'https://main--site--org.aem.live/media_abc.jpg',
    )).to.equal('/media_abc.jpg');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('DA source save path', () => {
    it('saveTranslatedImageToDaSource saves to /source/{org}/{site}/translated-images/{lang}{site-relative path}', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response('', { status: 200 }));
      const blob = new Blob(['x'], { type: 'image/png' });
      const org = 'adobecom';
      const site = 'da-dc';
      const langCode = 'de';
      const glaasName = '/acrobat/shared/hero.png';

      const result = await saveTranslatedImageToDaSource({
        org,
        site,
        langCode,
        glaasName,
        blob,
        contentType: 'image/png',
      });

      const expectedPath = buildTranslatedImageSourcePath({ langCode, glaasName });
      expect(result.url).to.equal(`https://content.da.live/${org}/${site}${expectedPath}`);
      const saveCall = fetchStub.getCalls().find((call) => String(call.args[0]).includes('/source/'));
      expect(saveCall).to.exist;
      expect(saveCall.args[0]).to.equal(`${DA_ADMIN}/source/${org}/${site}${expectedPath}`);
      expect(saveCall.args[0]).to.equal(`${DA_ADMIN}/source/adobecom/da-dc/translated-images/de/acrobat/shared/hero.png`);
      expect(saveCall.args[0]).not.to.include('/translated-images/de/adobecom/da-dc/');
      expect(saveCall.args[1].method).to.equal('POST');
      expect(saveCall.args[1].body).to.be.instanceOf(FormData);
    });

    it('saveTranslatedImageToDaSource supports nested paths and locale codes with hyphens', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response('', { status: 200 }));
      await saveTranslatedImageToDaSource({
        org: 'adobecom',
        site: 'da-dc',
        langCode: 'fr-CA',
        glaasName: '/acrobat/online/test/report.png',
        blob: new Blob(['x'], { type: 'image/png' }),
        contentType: 'image/png',
      });
      const saveCall = fetchStub.getCalls().find((call) => String(call.args[0]).includes('/source/'));
      expect(saveCall.args[0]).to.equal(`${DA_ADMIN}/source/adobecom/da-dc/translated-images/fr-CA/acrobat/online/test/report.png`);
    });

    it('saveTranslatedImageToDaSource skips images above the DA source size limit without saving', async () => {
      const fetchStub = sinon.stub(window, 'fetch');
      const oversized = new Blob([new Uint8Array(TRANSLATED_IMAGE_MAX_BYTES + 1)], { type: 'image/jpeg' });
      const result = await saveTranslatedImageToDaSource({
        org: 'adobecom',
        site: 'da-dc',
        langCode: 'de',
        glaasName: '/hero/large.jpg',
        blob: oversized,
        contentType: 'image/jpeg',
      });
      expect(fetchStub.called).to.be.false;
      expect(result.skipped).to.be.true;
      expect(result.warning).to.include('hero/large.jpg');
      expect(result.warning).to.include('20.00 MiB');
      expect(result.warning).to.include('keeping source URL');
    });
  });

  it('builds translated image source path from GLaaS lang code and site-relative glaas name', () => {
    const glaasName = '/acrobat/shared/hero.png';
    expect(buildTranslatedImageSourcePath({ langCode: 'de', glaasName }))
      .to.equal('/translated-images/de/acrobat/shared/hero.png');

    expect(buildTranslatedImageSourcePath({ langCode: '/fr-CA', glaasName }))
      .to.equal('/translated-images/fr-CA/acrobat/shared/hero.png');
  });

  it('infers image/png for langstore uploads when GLaaS returns octet-stream', () => {
    const daSourcePath = '/adobecom/da-dc/langstore/de/acrobat/foo/rectangle 810724.png';
    const blob = new Blob([], { type: 'application/octet-stream' });
    expect(blobContentTypeForDaSource({
      daSourcePath,
      blob,
      contentType: 'application/octet-stream',
    })).to.equal('image/png');
  });

  it('prepareMultimodalPageForSave saves images under DA /translated-images and rewrites html', async () => {
    const org = 'adobecom';
    const site = 'da-dc';
    const imageGlaasName = '/acrobat/shared/hero.png';
    const htmlAssetName = '/drafts/page.html';
    const contentDaLiveUrl = `https://content.da.live/${org}/${site}/acrobat/shared/hero.png`;
    const translatedHtml = `<img src="${contentDaLiveUrl}">`;
    const expectedSourcePath = buildTranslatedImageSourcePath({ langCode: 'de', glaasName: imageGlaasName });
    const expectedSourceSave = `${DA_ADMIN}/source/${org}/${site}${expectedSourcePath}`;
    const expectedDeliveryUrl = `https://content.da.live/${org}/${site}${expectedSourcePath}`;

    const fetchStub = sinon.stub(window, 'fetch').callsFake((url) => {
      const href = String(url);
      if (href.includes('/api/l10n/v2.0/') && href.includes(encodeURI(imageGlaasName))) {
        return Promise.resolve(new Response(
          JSON.stringify({ signedURL: 'https://signed.example/image' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      }
      if (href.includes('/api/l10n/v2.0/') && href.includes(encodeURI(htmlAssetName))) {
        return Promise.resolve(new Response(
          JSON.stringify({ signedURL: 'https://signed.example/html' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      }
      if (href === 'https://signed.example/image') {
        return Promise.resolve(new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 }));
      }
      if (href === 'https://signed.example/html') {
        return Promise.resolve(new Response(translatedHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }));
      }
      if (href === expectedSourceSave) {
        return Promise.resolve(new Response('', { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const result = await prepareMultimodalPageForSave({
      service: { origin: 'https://glaas.example', clientid: 'client' },
      token: 'token',
      task: { name: 'task-1', code: 'de', workflow: 'P/P' },
      org,
      site,
      langCode: 'de',
      pageAsset: {
        images: [{ glaasName: imageGlaasName, contentDaLiveUrl }],
      },
      htmlAssetName,
    });

    expect(fetchStub.calledWith(expectedSourceSave, sinon.match({ method: 'POST' }))).to.be.true;
    expect(result.text).to.include(expectedDeliveryUrl);
    expect(result.text).not.to.include(contentDaLiveUrl);
  });

  it('prepareMultimodalPageForSave skips oversized images and keeps source URLs in html', async () => {
    const org = 'adobecom';
    const site = 'da-dc';
    const imageGlaasName = '/acrobat/shared/hero-large.jpg';
    const htmlAssetName = '/drafts/page.html';
    const contentDaLiveUrl = `https://content.da.live/${org}/${site}/acrobat/shared/hero-large.jpg`;
    const translatedHtml = `<img src="${contentDaLiveUrl}">`;
    const oversized = new Blob([new Uint8Array(TRANSLATED_IMAGE_MAX_BYTES + 1)], { type: 'image/jpeg' });
    const warnings = [];

    const fetchStub = sinon.stub(window, 'fetch').callsFake((url) => {
      const href = String(url);
      if (href.includes('/api/l10n/v2.0/') && href.includes(encodeURI(imageGlaasName))) {
        return Promise.resolve(new Response(
          JSON.stringify({ signedURL: 'https://signed.example/image' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      }
      if (href.includes('/api/l10n/v2.0/') && href.includes(encodeURI(htmlAssetName))) {
        return Promise.resolve(new Response(
          JSON.stringify({ signedURL: 'https://signed.example/html' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
      }
      if (href === 'https://signed.example/image') {
        return Promise.resolve(new Response(oversized, { status: 200 }));
      }
      if (href === 'https://signed.example/html') {
        return Promise.resolve(new Response(translatedHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const result = await prepareMultimodalPageForSave({
      service: { origin: 'https://glaas.example', clientid: 'client' },
      token: 'token',
      task: { name: 'task-1', code: 'de', workflow: 'P/P' },
      org,
      site,
      langCode: 'de',
      pageAsset: {
        images: [{ glaasName: imageGlaasName, contentDaLiveUrl }],
      },
      htmlAssetName,
      onWarning: (message) => warnings.push(message),
    });

    const sourceSaves = fetchStub.getCalls()
      .filter((call) => String(call.args[0]).includes('/translated-images/'));
    expect(sourceSaves).to.have.length(0);
    expect(result.text).to.include(contentDaLiveUrl);
    expect(result.skippedImages).to.have.length(1);
    expect(result.skippedImages[0].glaasName).to.equal(imageGlaasName);
    expect(warnings).to.have.length(1);
    expect(warnings[0].type).to.equal('warning');
    expect(warnings[0].text).to.include('keeping source URL');
    expect(warnings[0].text).to.include('hero-large.jpg');
  });

  it('rewrites img[src] and mirrors delivery URL onto picture source[srcset]', () => {
    const deliveryUrl = 'https://main--da-dc--adobecom.aem.page/media_abc.avif';
    const html = `
      <picture>
        <source srcset="https://content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png 1x">
        <source srcset="https://content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png 1x" media="(min-width: 600px)">
        <img src="https://content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png">
      </picture>
    `;
    const pathToNewUrl = new Map([
      ['https://content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png', deliveryUrl],
    ]);
    const out = rewriteContentDaLiveImageUrls(html, pathToNewUrl);
    expect(out).to.include(`src="${deliveryUrl}"`);
    expect(out).to.include(`srcset="${deliveryUrl}"`);
    expect(out).not.to.include('content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png');
  });

  it('rewrites comma-containing filenames without srcset comma splitting', () => {
    const contentDaLiveUrl = 'https://content.da.live/adobecom/da-dc/drafts/demo/.hero/variant=default,%20width=half%20or%20third,%20content=feature%20image.png';
    const deliveryUrl = 'https://main--da-dc--adobecom.aem.page/media_hero.avif';
    const html = `
      <picture>
        <source srcset="${contentDaLiveUrl}">
        <source srcset="${contentDaLiveUrl}" media="(min-width: 600px)">
        <img src="${contentDaLiveUrl}">
      </picture>
    `;
    const pathToNewUrl = new Map([
      [contentDaLiveUrl, deliveryUrl],
    ]);
    const out = rewriteContentDaLiveImageUrls(html, pathToNewUrl);
    expect(out).to.include(`src="${deliveryUrl}"`);
    expect((out.match(/srcset="/g) ?? []).length).to.equal(2);
    expect(out).not.to.include('content.da.live');
    expect(out).not.to.include('variant=default,');
  });

  it('resolves a DNT-relativized marked image via LOC_SRC_ATTR and removes the attribute after rewriting', () => {
    // Regression: pathToNewUrl is keyed by the original absolute href (see fetchMultimodalImage),
    // but a marked AEM-hosted image's src has already been relativized by DNT by this point -
    // LOC_SRC_ATTR (see dnt.js) is what lets this still resolve to the right entry.
    const originalSrc = 'https://main--cc--adobecom.aem.live/media_abc.png';
    const deliveryUrl = 'https://main--da-dc--adobecom.aem.page/media_translated.avif';
    const html = `<img src="./media_abc.png" ${LOC_SRC_ATTR}="${originalSrc}">`;
    const pathToNewUrl = new Map([[originalSrc, deliveryUrl]]);
    const out = rewriteContentDaLiveImageUrls(html, pathToNewUrl);
    expect(out).to.include(`src="${deliveryUrl}"`);
    expect(out).not.to.include(LOC_SRC_ATTR);
  });

  describe('fetchMultimodalImage', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('routes a plain absolute image URL (e.g. published .aem.live media) through the CORS proxy', async () => {
      // A bare fetch() to published .aem.live media is CORS-blocked from da.live - same
      // proxy pattern already used by the trados connector and media-library.
      const imageUrl = 'https://main--cc--adobecom.aem.live/media_abc.png';
      const blob = new Blob(['fake-bytes'], { type: 'image/png' });
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response(blob, { status: 200 }));

      const result = await fetchMultimodalImage({ imageIndex: 1, imageUrl });

      expect(fetchStub.calledOnce).to.be.true;
      const [proxyUrl] = fetchStub.firstCall.args;
      expect(proxyUrl).to.equal(`${DA_ETC}/cors?url=${encodeURIComponent(imageUrl)}`);
      expect(result.error).to.equal(undefined);
      expect(result.imageBlob.size).to.equal(blob.size);
      expect(result.imageBlob.type).to.equal(blob.type);
    });

    it('routes an arbitrary external host through the CORS proxy too', async () => {
      const imageUrl = 'https://example.com/photo.jpg';
      const blob = new Blob(['fake-bytes'], { type: 'image/jpeg' });
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response(blob, { status: 200 }));

      await fetchMultimodalImage({ imageIndex: 1, imageUrl });

      const [proxyUrl] = fetchStub.firstCall.args;
      expect(proxyUrl).to.equal(`${DA_ETC}/cors?url=${encodeURIComponent(imageUrl)}`);
    });

    it('returns an error when the proxied fetch is not ok', async () => {
      sinon.stub(window, 'fetch').resolves(new Response('', { status: 404 }));
      const result = await fetchMultimodalImage({
        imageIndex: 1,
        imageUrl: 'https://main--cc--adobecom.aem.live/media_missing.png',
      });
      expect(result.error).to.be.a('string');
      expect(result.status).to.equal(404);
    });
  });
});
