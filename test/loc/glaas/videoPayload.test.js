import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  SOURCE_CAPTION_LOCALE,
  buildMultimodalVideoAssets,
} from '../../../nx/blocks/loc/connectors/glaas/videoPayload.js';

describe('GLaaS video payload builders', () => {
  const originalUrl = 'https://video.tv.adobe.com/v/333754?autoplay=false#t=10';
  const mp4 = 'https://images-tv.adobe.com/mpcv3/medium.mp4?signature=AbC%2F123';
  const videoId = 'baac64d8-f931-4a14-b0e4-6574cb1a6846';
  const pagePath = '/resources/example.html';
  const pagePreviewUrl = 'https://main--site--org.aem.page/resources/example';
  const page = {
    pagePath,
    pagePreviewUrl,
    videos: new Map([[originalUrl, { mp4, videoId }]]),
  };
  const targetLocales = ['fr-FR', 'de-DE'];

  afterEach(() => sinon.restore());

  it('adds the exact source-caption locale without changing selected target locales', () => {
    expect(SOURCE_CAPTION_LOCALE).to.equal('en-x-cc');
    const { assets } = buildMultimodalVideoAssets({ pages: [page], targetLocales });
    expect(assets[0].targetLocales).to.deep.equal(['fr-FR', 'de-DE', 'en-x-cc']);
    expect(targetLocales).to.deep.equal(['fr-FR', 'de-DE']);
  });

  it('supports source captions without target-language captions', () => {
    const { assets } = buildMultimodalVideoAssets({ pages: [page], targetLocales: [] });
    expect(assets[0].targetLocales).to.deep.equal(['en-x-cc']);
  });

  it('builds VIDEO assets and local delivery mapping from resolved videos without fetching', () => {
    const fetchStub = sinon.stub(window, 'fetch');
    const { assets, mapping } = buildMultimodalVideoAssets({ pages: [page], targetLocales });
    expect(assets).to.have.length(1);
    const [{ name }] = assets;
    expect(name).to.equal(`/resources/example/${videoId}.mp4`);
    expect(assets[0]).to.deep.equal({
      type: 'VIDEO',
      name,
      parentAsset: pagePath,
      signedUrl: mp4,
      sourcePreviewUrl: originalUrl,
      sourcePreviewUrlPage: pagePreviewUrl,
      contentType: 'video/mp4',
      targetLocales: ['fr-FR', 'de-DE', 'en-x-cc'],
    });
    expect(mapping).to.deep.equal({
      [name]: { originalUrls: [originalUrl], videoId },
    });
    expect(fetchStub.called).to.be.false;
  });

  it('omits an unavailable page preview rather than serializing undefined', () => {
    const { assets } = buildMultimodalVideoAssets({
      pages: [{ pagePath, videos: page.videos }],
      targetLocales,
    });
    expect(assets[0]).not.to.have.property('sourcePreviewUrlPage');
    expect(assets[0].parentAsset).to.equal(pagePath);
  });

  it('returns no assets or delivery mapping when there are no resolved videos', () => {
    for (const pages of [[], [{ ...page, videos: new Map() }]]) {
      const result = buildMultimodalVideoAssets({ pages, targetLocales });
      expect(result).to.deep.equal({ assets: [], mapping: {} });
    }
  });

  it('keeps names stable when MP4 signatures, locale choices, or page previews change', () => {
    const first = buildMultimodalVideoAssets({ pages: [page], targetLocales });
    const second = buildMultimodalVideoAssets({
      pages: [{
        ...page,
        pagePreviewUrl: `${pagePreviewUrl}?preview=updated`,
        videos: new Map([[originalUrl, { mp4: `${mp4}&expires=999`, videoId }]]),
      }],
      targetLocales: ['ja-JP'],
    });
    expect(second.assets[0].name).to.equal(first.assets[0].name);
    expect(second.assets[0].signedUrl).to.equal(`${mp4}&expires=999`);
  });

  it('uses distinct names and correlations for the same video on different pages', () => {
    const otherPage = { ...page, pagePath: '/resources/other.html' };
    const { assets, mapping } = buildMultimodalVideoAssets({
      pages: [page, otherPage], targetLocales,
    });
    expect(assets).to.have.length(2);
    expect(assets[0].name).not.to.equal(assets[1].name);
    expect(mapping[assets[0].name]).to.deep.equal({ originalUrls: [originalUrl], videoId });
    expect(mapping[assets[1].name]).to.deep.equal({
      originalUrls: [originalUrl], videoId,
    });
  });

  it('groups URL variants resolving to the same page/videoID and retains every original URL', () => {
    const urls = [
      originalUrl,
      originalUrl.replace('#t=10', '#t=20'),
      originalUrl.replace('autoplay=false', 'autoplay=true'),
      originalUrl.replace('video.tv.adobe.com', 'stage-video.tv.adobe.com'),
    ];
    const { assets, mapping } = buildMultimodalVideoAssets({
      pages: [{ ...page, videos: new Map(urls.map((href) => [href, { mp4, videoId }])) }],
      targetLocales,
    });
    expect(assets).to.have.length(1);
    expect(assets[0].sourcePreviewUrl).to.equal(originalUrl);
    expect(mapping).to.deep.equal({
      [assets[0].name]: { originalUrls: urls, videoId },
    });
  });

  it('does not duplicate an asset when the same page is supplied twice', () => {
    const { assets, mapping } = buildMultimodalVideoAssets({
      pages: [page, page], targetLocales,
    });
    expect(assets).to.have.length(1);
    expect(Object.keys(mapping)).to.deep.equal([assets[0].name]);
    expect(mapping[assets[0].name].originalUrls).to.deep.equal([originalUrl]);
  });

  it('uses separate readable paths for different video IDs on one page', () => {
    const otherId = 'another-id';
    const { assets } = buildMultimodalVideoAssets({
      pages: [{
        ...page,
        videos: new Map([
          [originalUrl, { mp4, videoId }],
          ['https://video.tv.adobe.com/v/2', { mp4, videoId: otherId }],
        ]),
      }],
      targetLocales,
    });
    expect(assets.map(({ name }) => name)).to.deep.equal([
      `/resources/example/${videoId}.mp4`,
      '/resources/example/another-id.mp4',
    ]);
  });

  it('keeps stable names regardless of page ordering', () => {
    const other = { ...page, pagePath: '/resources/other.html' };
    const first = buildMultimodalVideoAssets({ pages: [page, other], targetLocales });
    const second = buildMultimodalVideoAssets({ pages: [other, page], targetLocales });
    expect(second.assets.map(({ name }) => name)).to.deep.equal(
      first.assets.map(({ name }) => name).reverse(),
    );
  });

  it('does not mutate resolved videos or share mutable locale arrays between assets', () => {
    const metadata = Object.freeze({ mp4, videoId });
    const videos = new Map([[originalUrl, metadata]]);
    const { assets } = buildMultimodalVideoAssets({
      pages: [{ ...page, videos }, { ...page, pagePath: '/other.html' }],
      targetLocales: Object.freeze([...targetLocales]),
    });
    assets[0].targetLocales.push('ja-JP');
    expect(assets[1].targetLocales).to.deep.equal(['fr-FR', 'de-DE', 'en-x-cc']);
    expect(videos.get(originalUrl)).to.equal(metadata);
    expect(metadata).to.deep.equal({ mp4, videoId });
  });
});
