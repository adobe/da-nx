import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ORIGIN } from '../../../nx/public/utils/constants.js';
import {
  blobContentTypeForDaSource,
  buildTranslatedMediaPath,
  postImageToDaMedia,
  prepareMultimodalPageForSave,
  siteRelativePathFromContentDaLiveUrl,
  rewriteContentDaLiveImageUrls,
} from '../../../nx/blocks/loc/connectors/glaas/multimodalApi.js';

describe('GLaaS multimodal save', () => {
  it('strips content.da.live org/site segments from image URL', () => {
    expect(siteRelativePathFromContentDaLiveUrl(
      'https://content.da.live/adobecom/da-dc/acrobat/online/test/.acrobat-pro/report.png',
    )).to.equal('/acrobat/online/test/.acrobat-pro/report.png');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('media bus POST path', () => {
    it('postImageToDaMedia hits /media/{org}/{site}/{lang}{site-relative path}', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response(
        JSON.stringify({ uri: 'https://main--da-dc--adobecom.aem.page/media_abc.avif' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
      const blob = new Blob(['x'], { type: 'image/png' });
      const org = 'adobecom';
      const site = 'da-dc';
      const langCode = 'de';
      const glaasName = '/acrobat/shared/hero.png';

      const result = await postImageToDaMedia({
        org,
        site,
        langCode,
        glaasName,
        blob,
        contentType: 'image/png',
      });

      expect(result.url).to.equal('https://main--da-dc--adobecom.aem.page/media_abc.avif');
      expect(fetchStub.calledOnce).to.be.true;
      const [url, opts] = fetchStub.firstCall.args;
      expect(url).to.equal(`${DA_ORIGIN}/media/${org}/${site}${buildTranslatedMediaPath({ langCode, glaasName })}`);
      expect(url).to.equal(`${DA_ORIGIN}/media/adobecom/da-dc/de/acrobat/shared/hero.png`);
      expect(url).not.to.include('/media/adobecom/da-dc/de/adobecom/da-dc/');
      expect(opts.method).to.equal('POST');
      expect(opts.body).to.be.instanceOf(FormData);
    });

    it('postImageToDaMedia supports nested paths and locale codes with hyphens', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(new Response(
        JSON.stringify({ url: 'https://main--da-dc--adobecom.aem.page/media_nested.avif' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
      await postImageToDaMedia({
        org: 'adobecom',
        site: 'da-dc',
        langCode: 'fr-CA',
        glaasName: '/acrobat/online/test/report.png',
        blob: new Blob(['x'], { type: 'image/png' }),
        contentType: 'image/png',
      });
      const [url] = fetchStub.firstCall.args;
      expect(url).to.equal(`${DA_ORIGIN}/media/adobecom/da-dc/fr-CA/acrobat/online/test/report.png`);
    });
  });

  it('builds translated media path from GLaaS lang code and site-relative glaas name', () => {
    const glaasName = '/acrobat/shared/hero.png';
    expect(buildTranslatedMediaPath({ langCode: 'de', glaasName }))
      .to.equal('/de/acrobat/shared/hero.png');

    expect(buildTranslatedMediaPath({ langCode: '/fr-CA', glaasName }))
      .to.equal('/fr-CA/acrobat/shared/hero.png');
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

  it('prepareMultimodalPageForSave posts images to media and rewrites html', async () => {
    const org = 'adobecom';
    const site = 'da-dc';
    const imageGlaasName = '/acrobat/shared/hero.png';
    const htmlAssetName = '/drafts/page.html';
    const contentDaLiveUrl = `https://content.da.live/${org}/${site}/acrobat/shared/hero.png`;
    const translatedHtml = `<img src="${contentDaLiveUrl}">`;
    const deliveryUrl = 'https://main--da-dc--adobecom.aem.page/media_abc.avif';

    const expectedMediaPost = `${DA_ORIGIN}/media/${org}/${site}/de/acrobat/shared/hero.png`;
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
      if (href === expectedMediaPost) {
        return Promise.resolve(new Response(
          JSON.stringify({ uri: deliveryUrl }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
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

    expect(fetchStub.calledWith(expectedMediaPost, sinon.match({ method: 'POST' }))).to.be.true;
    expect(result.text).to.include('main--da-dc--adobecom.aem.page/media_abc.avif');
    expect(result.text).not.to.include(contentDaLiveUrl);
  });

  it('rewrites img and srcset content.da.live URLs to media bus delivery urls', () => {
    const html = `
      <picture>
        <source srcset="https://content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png 1x">
        <img src="https://content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png">
      </picture>
    `;
    const pathToNewUrl = new Map([
      ['/adobecom/da-dc/acrobat/foo/rect 1.png', 'https://main--da-dc--adobecom.aem.page/media_abc.avif'],
    ]);
    const out = rewriteContentDaLiveImageUrls(html, pathToNewUrl);
    expect(out).to.include('main--da-dc--adobecom.aem.page/media_abc.avif');
    expect(out).not.to.include('content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png');
  });
});
