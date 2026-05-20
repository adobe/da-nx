import { expect } from '@esm-bundle/chai';
import { contentDaLiveHrefForAttribute } from '../../../nx/blocks/loc/connectors/glaas/multimodalApi.js';
import {
  aemBasePathFromLangstoreSource,
  buildLocaleImageUrlMapForRollout,
  buildMultimodalRolloutMediaEntries,
  collectLangstoreContentDaLiveImageUrls,
  daPathsFromLangstoreHtml,
  isMultimodalRolloutFromLangstoreHtml,
  isMultimodalPageForLang,
  getMultimodalRollout,
  mediaDaPathsFromPageAssets,
  rewriteHtmlForLocaleRollout,
  buildLocaleImageUrlMap,
  shouldRunMultimodalRollout,
} from '../../../nx/blocks/loc/views/rollout/multimodalRollout.js';

const org = 'adobecom';
const site = 'da-dc';
const langLocation = '/langstore/fr';

describe('MULTIMODAL rollout gate', () => {
  it('uses workflowTasks when present', () => {
    const lang = {
      code: 'fr',
      translation: {
        workflowTasks: {
          t1: {
            workflowName: 'MULTIMODAL',
            urls: ['/page-a'],
            pageAssets: { '/page-a': { images: [] } },
          },
        },
      },
    };
    expect(isMultimodalPageForLang({ lang, suppliedPath: '/page-a', config: null })).to.equal(true);
    expect(isMultimodalPageForLang({ lang, suppliedPath: '/other', config: null })).to.equal(false);
  });

  it('uses loc-page-rules when no task', () => {
    const lang = { code: 'de', workflow: 'P/P', workflowName: 'Transcreation' };
    const config = {
      'loc-page-rules': {
        data: [{
          url: '/page-a',
          languages: 'de',
          workflow: 'P/P',
          workflowName: 'MULTIMODAL',
        }],
      },
    };
    expect(isMultimodalPageForLang({ lang, suppliedPath: '/page-a', config })).to.equal(true);
    expect(isMultimodalPageForLang({ lang, suppliedPath: '/page-b', config })).to.equal(false);
  });

  it('shouldRunMultimodalRollout is false for plain pages without rules or langstore images', () => {
    const lang = { code: 'de', location: '/langstore/de' };
    const html = '<p>Hello</p><img src="https://main--da-dc--adobecom.aem.live/foo.png">';
    expect(shouldRunMultimodalRollout({
      lang, suppliedPath: '/page-a', config: null, html, org, site, langLocation,
    })).to.equal(false);
  });

  it('shouldRunMultimodalRollout is true from langstore HTML alone (tier 2)', () => {
    const lang = { code: 'fr', location: '/langstore/fr' };
    const html = '<img src="https://content.da.live/adobecom/da-dc/langstore/fr/acrobat/a.png">';
    expect(shouldRunMultimodalRollout({
      lang, suppliedPath: '/acrobat/page', config: null, html, org, site, langLocation,
    })).to.equal(true);
    expect(isMultimodalRolloutFromLangstoreHtml({ html, org, site, langLocation })).to.equal(true);
  });
});

describe('MULTIMODAL rollout media paths', () => {
  it('builds langstore paths from pageAssets', () => {
    const paths = mediaDaPathsFromPageAssets({
      org,
      site,
      langLocation,
      pageAsset: {
        images: [{ glaasName: '/adobecom/da-dc/acrobat/foo.png' }],
      },
    });
    expect(paths).to.deep.equal([
      '/adobecom/da-dc/langstore/fr/acrobat/foo.png',
    ]);
  });

  it('strips langstore prefix for locale aemBasePath', () => {
    const daSource = '/adobecom/da-dc/langstore/fr/acrobat/foo.png';
    expect(aemBasePathFromLangstoreSource({
      org, site, langLocation, daSourcePath: daSource,
    })).to.equal('/acrobat/foo.png');
  });

  it('builds rollout media entries without double langstore in dest path', () => {
    const daSource = '/adobecom/da-dc/langstore/fr/acrobat/foo.png';
    const entries = buildMultimodalRolloutMediaEntries({
      org, site, langLocation, daSourcePaths: [daSource],
    });
    expect(entries[0].aemBasePath).to.equal('/acrobat/foo.png');
    expect(entries[0].source).to.equal(daSource);
  });

  it('collects langstore content.da.live URLs from HTML', () => {
    const html = `
      <img src="https://content.da.live/adobecom/da-dc/langstore/fr/acrobat/a.png">
      <img src="https://content.da.live/adobecom/da-dc/acrobat/b.png">
    `;
    const urls = collectLangstoreContentDaLiveImageUrls(html, org, site, langLocation);
    expect(urls).to.have.length(1);
    expect(urls[0]).to.include('/langstore/fr/');
  });

  it('maps langstore paths from HTML to DA source paths', () => {
    const html = '<img src="https://content.da.live/adobecom/da-dc/langstore/fr/acrobat/a.png">';
    const paths = daPathsFromLangstoreHtml({ html, org, site, langLocation });
    expect(paths[0]).to.equal('/adobecom/da-dc/langstore/fr/acrobat/a.png');
  });

  it('parses srcset URLs with spaces in filenames', () => {
    const html = `
      <source srcset="https://content.da.live/adobecom/da-dc/langstore/fr/acrobat/online/test/.acrobat-pro/rectangle 810724.png">
    `;
    const paths = daPathsFromLangstoreHtml({ html, org, site, langLocation });
    expect(paths[0]).to.equal(
      '/adobecom/da-dc/langstore/fr/acrobat/online/test/.acrobat-pro/rectangle 810724.png',
    );
  });
});

describe('MULTIMODAL rollout HTML rewrite', () => {
  it('rewrites langstore image URLs to locale delivery URLs', () => {
    const map = buildLocaleImageUrlMap({
      org,
      site,
      langLocation,
      localeCode: '/fr',
      glaasNames: ['/adobecom/da-dc/acrobat/a.png'],
    });
    const html = '<img src="https://content.da.live/adobecom/da-dc/langstore/fr/acrobat/a.png">';
    const out = rewriteHtmlForLocaleRollout(html, map);
    expect(out).to.include('/adobecom/da-dc/fr/acrobat/a.png');
    expect(out).not.to.include('/langstore/fr/');
  });

  it('builds rewrite map from langstore URLs in HTML (no pageAssets)', () => {
    const html = '<img src="https://content.da.live/adobecom/da-dc/langstore/fr/acrobat/online/test/.acrobat-pro/rectangle 810724.png">';
    const map = buildLocaleImageUrlMapForRollout({
      html,
      org,
      site,
      langLocation,
      localeCode: '/de',
      glaasNames: [],
    });
    expect(map.size).to.equal(1);
    const out = rewriteHtmlForLocaleRollout(html, map);
    expect(out).to.include('rectangle%20810724.png');
    expect(out).not.to.include('/langstore/fr/');
  });

  it('encodes spaces in delivery URLs for valid srcset', () => {
    const raw = 'https://content.da.live/adobecom/da-dc/de/acrobat/rectangle 810724.png';
    expect(contentDaLiveHrefForAttribute(raw)).to.include('rectangle%20810724.png');
  });
});

describe('langstore multimodal rollout (plugin)', () => {
  it('returns null when currPrefix is not langstore', async () => {
    const result = await getMultimodalRollout({
      org,
      site,
      path: '/acrobat/page',
      currPrefix: '/de',
    });
    expect(result).to.equal(null);
  });
});

describe('MULTIMODAL rollout replaces langstore image URLs', () => {
  it('rewrites langstore image URL to locale in rolled-out HTML', () => {
    const html = '<img src="https://content.da.live/adobecom/da-dc/langstore/fr/acrobat/a.png">';
    const map = buildLocaleImageUrlMapForRollout({
      html,
      org,
      site,
      langLocation,
      localeCode: '/de',
      glaasNames: [],
    });
    expect(map.size).to.equal(1);
    const out = rewriteHtmlForLocaleRollout(html, map);
    expect(out).to.include('/adobecom/da-dc/de/acrobat/a.png');
    expect(out).not.to.include('/langstore/fr/');
  });
});
