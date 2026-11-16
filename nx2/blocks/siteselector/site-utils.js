export function getSiteOptions({ recentSites = [], current }) {
  const sites = [...new Set([current, ...recentSites].filter(
    (site) => typeof site === 'string' && /^[^/]+\/[^/]+$/.test(site),
  ))];
  return sites.map((value) => ({ value, label: value }));
}

export function setRecentSite({ org, site }) {
  if (!site || site.startsWith('.')) return;
  const currentSites = JSON.parse(localStorage.getItem('da-sites') || '[]');
  if (!Array.isArray(currentSites)) throw new TypeError('Recent sites must be a list.');
  const siteString = `${org}/${site}`;
  if (currentSites[0] === siteString) return;
  const sites = [siteString, ...currentSites.filter((value) => value !== siteString)].slice(0, 8);
  localStorage.setItem('da-sites', JSON.stringify(sites));
}

export function getCreateSiteHref({ href = window.location.href } = {}) {
  const url = new URL(href);
  url.pathname = '/start';
  url.searchParams.delete('browse');
  url.searchParams.delete('site');
  url.searchParams.delete('org');
  url.hash = '';
  return url.href;
}
