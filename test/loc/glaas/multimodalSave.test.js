import { expect } from '@esm-bundle/chai';
import {
  blobContentTypeForDaSource,
  buildLangstoreContentDaLiveUrl,
  buildLangstoreDaSourcePath,
  langstorePathFromGlaasName,
  rewriteContentDaLiveImageUrls,
} from '../../../nx/blocks/loc/connectors/glaas/multimodalApi.js';

describe('GLaaS multimodal save', () => {
  it('strips org/site from glaas name for langstore paths', () => {
    expect(langstorePathFromGlaasName({
      org: 'adobecom',
      site: 'da-dc',
      glaasName: '/adobecom/da-dc/acrobat/online/test/.acrobat-pro/report.png',
    })).to.equal('/acrobat/online/test/.acrobat-pro/report.png');
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

  it('builds langstore DA source and content.da.live URLs', () => {
    expect(buildLangstoreDaSourcePath({
      org: 'adobecom',
      site: 'da-dc',
      langLocation: '/langstore/de-DE',
      glaasName: '/adobecom/da-dc/acrobat/foo/rect.png',
    })).to.equal('/adobecom/da-dc/langstore/de-DE/acrobat/foo/rect.png');

    expect(buildLangstoreContentDaLiveUrl({
      org: 'adobecom',
      site: 'da-dc',
      langLocation: '/langstore/de-DE',
      glaasName: '/adobecom/da-dc/acrobat/foo/rect.png',
    })).to.equal('https://content.da.live/adobecom/da-dc/langstore/de-DE/acrobat/foo/rect.png');
  });

  it('rewrites img and srcset content.da.live URLs', () => {
    const html = `
      <picture>
        <source srcset="https://content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png 1x">
        <img src="https://content.da.live/adobecom/da-dc/acrobat/foo/rect%201.png">
      </picture>
    `;
    const pathToNewUrl = new Map([
      ['/adobecom/da-dc/acrobat/foo/rect 1.png', 'https://content.da.live/adobecom/da-dc/langstore/de-DE/acrobat/foo/rect 1.png'],
    ]);
    const out = rewriteContentDaLiveImageUrls(html, pathToNewUrl);
    expect(out).to.include('langstore/de-DE/acrobat/foo/rect%201.png');
    expect(out).not.to.include('content.da.live/adobecom/foo/rect%201.png');
  });
});
