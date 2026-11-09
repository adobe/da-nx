export function getSiteOptions({ recentSites = [], current }) {
  const sites = [...new Set([current, ...recentSites].filter(
    (site) => typeof site === 'string' && /^[^/]+\/[^/]+$/.test(site),
  ))];
  return sites.map((value) => ({ value, label: value }));
}

export function parseSubdomain(siteUrl) {
  try {
    const url = new URL(siteUrl);
    if (!/\.(?:hlx|aem)\.(?:live|page)$/.test(url.hostname)) return null;
    const [, site, org] = url.hostname.split('.')[0].split('--');
    if (!site || !org) return null;
    return `#/${[org, site]
      .map((name) => name.replace(/[^a-z0-9_]+/g, '-').replace(/-$/, ''))
      .join('/')}`;
  } catch {
    return null;
  }
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
