import { expect } from '@esm-bundle/chai';
import { glaasSourcePreviewUrl } from '../../../nx/blocks/loc/connectors/glaas/api.js';
import {
  buildMultimodalPageAssetEntry,
  collectContentDaLiveImageUrls,
  collectMultimodalAssetNames,
  countMultimodalTranslatedPages,
  contentDaLiveToDaSourceUrl,
  isV2AssetReady,
  v2AssetStatusFromProbe,
} from '../../../nx/blocks/loc/connectors/glaas/multimodalApi.js';

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
      'https://admin.da.live/source/adobecom/da-dc/acrobat/test/.acrobat-pro/rect.png',
    );
  });
});

describe('GLaaS multimodal pageAssets', () => {
  it('builds page asset entry with html glaas name and image metadata', () => {
    const html = `
      <img src="https://content.da.live/adobecom/foo/rectangle%20810724.png">
    `;
    const imageUrls = collectContentDaLiveImageUrls(html);
    const entry = buildMultimodalPageAssetEntry({
      htmlAssetName: '/drafts/demo/page.html',
      imageUrls,
    });
    expect(entry.htmlGlaasName).to.equal('/drafts/demo/page.html');
    expect(entry.images).to.have.length(1);
    expect(entry.images[0].contentDaLiveUrl).to.include('rectangle%20810724.png');
    expect(entry.images[0].glaasName).to.equal('/adobecom/foo/rectangle 810724.png');
  });

  it('ignores relative ./media_ paths (DNT) that are not on content.da.live', () => {
    const html = `
      <img src="./media_13f28848e8da34fafe003ee7053bf2118fb26c78a.jpg">
      <img src="https://main--dc--adobecom.aem.live/media_13f28848e8da34fafe003ee7053bf2118fb26c78a.jpg">
    `;
    expect(collectContentDaLiveImageUrls(html)).to.deep.equal([]);
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

describe('GLaaS multimodal v2 asset status', () => {
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
          { glaasName: '/org/site/media/hero.png' },
          { glaasName: '/org/site/media/report.png' },
        ],
      },
    };
    const assets = [
      { assetName: '/drafts/demo/page.html', status: 'COMPLETED' },
      { assetName: '/org/site/media/hero.png', status: 'COMPLETED' },
      { assetName: '/org/site/media/report.png', status: 'COMPLETED' },
    ];
    expect(countMultimodalTranslatedPages(singlePageAssets, assets)).to.equal(1);
    expect(assets.filter((asset) => asset.status === 'COMPLETED').length).to.equal(3);
  });
});
