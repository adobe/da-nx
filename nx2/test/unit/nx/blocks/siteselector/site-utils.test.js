import { expect } from '@esm-bundle/chai';
import {
  getSiteOptions, parseSubdomain, getCreateSiteHref, getBrowseHref, setRecentSite,
} from '../../../../../blocks/siteselector/site-utils.js';

describe('site selector utilities', () => {
  it('preserves stored names while deduplicating and skipping malformed identifiers', () => {
    expect(getSiteOptions({
      current: 'Adobe/Current.Site',
      recentSites: ['My.Org/Other.Site', 'Adobe/Current.Site', '/bad/path', 'org/', '/site', null],
    })).to.deep.equal([
      { value: 'Adobe/Current.Site', label: 'Adobe/Current.Site' },
      { value: 'My.Org/Other.Site', label: 'My.Org/Other.Site' },
    ]);
  });

  it('extracts and normalizes site identifiers like the landing page', () => {
    for (const domain of ['aem.page', 'aem.live', 'hlx.page', 'hlx.live']) {
      expect(parseSubdomain(`https://main--my-site--my-org.${domain}/page`)).to.equal('#/my-org/my-site');
    }
    expect(parseSubdomain('https://main--my_site--my_org.aem.live')).to.equal('#/my_org/my_site');
    expect(parseSubdomain('https://main--site--org-.aem.live')).to.equal('#/org/site');
    for (const href of ['not a URL', 'https://example.com', 'https://main--site.aem.live']) {
      expect(parseSubdomain(href)).to.be.null;
    }
  });

  it('preserves preview settings but removes organization and site context from creation', () => {
    const url = new URL(getCreateSiteHref({
      href: 'https://da.live/browse?nx=preview&nxver=2&browse=2&site=old&org=old#/org/site',
    }));
    expect(url.origin).to.equal('https://da.live');
    expect(url.pathname).to.equal('/start');
    expect([...url.searchParams]).to.deep.equal([['nx', 'preview'], ['nxver', '2']]);
    expect(url.hash).to.equal('');
  });

  it('deduplicates and bounds recent history in actual browser storage', () => {
    const saved = localStorage.getItem('da-sites');
    const sites = Array.from({ length: 8 }, (_, index) => `org/site-${index}`);
    try {
      localStorage.setItem('da-sites', JSON.stringify(sites));
      setRecentSite({ org: 'org', site: 'site-7' });
      expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal([sites[7], ...sites.slice(0, 7)]);
    } finally {
      if (saved === null) localStorage.removeItem('da-sites');
      else localStorage.setItem('da-sites', saved);
    }
  });

  it('builds a Browse link at the root that keeps the query', () => {
    expect(getBrowseHref({
      hash: '#/org/site',
      href: 'https://da.live/drafts/landing?nx=preview&nxver=2#/old/site',
    })).to.equal('https://da.live/?nx=preview&nxver=2#/org/site');
  });
});
