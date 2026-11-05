export function getSiteOptions({ recentSites = [], current }) {
  const sites = [...new Set([current, ...recentSites].filter(
    (site) => typeof site === 'string' && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(site),
  ))];
  return sites.map((value) => ({ value, label: value }));
}

export function parseSubdomain(siteUrl) {
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const match = url.hostname.match(/^([^.]+)\.(?:hlx|aem)\.(?:live|page)$/);
  if (!match) return null;
  const [branch, site, org, ...extra] = match[1].split('--');
  if (extra.length || ![branch, site, org].every((part) => /^[a-z0-9][a-z0-9_-]*$/.test(part || ''))) return null;
  return `#/${org.replace(/-$/, '')}/${site.replace(/-$/, '')}`;
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

export function hasOrgAdminGrant(response) {
  const actions = response.headers?.get('x-da-actions')?.split('=').pop().split(',');
  return response.ok && !!actions?.some((action) => action.trim() === 'write');
}

export function getCreateSiteHref({ org, href = window.location.href }) {
  const url = new URL(href);
  url.pathname = '/start';
  url.searchParams.delete('browse');
  url.searchParams.delete('site');
  url.searchParams.set('org', org);
  url.hash = '';
  return url.href;
}

export async function checkSiteAccess({ value, source, signal }) {
  signal.throwIfAborted();
  const result = await source.list(`/${value}`, { opts: { signal } });
  signal.throwIfAborted();
  if (result.ok) return true;
  const response = await source.getMetadata(`/${value}/`);
  signal.throwIfAborted();
  if (response.status === 403) return false;
  if (response.status === 401) throw new Error(`Sign in to check access to ${value}.`);
  throw new Error(`Could not verify access to ${value}. Please try again.`);
}

export async function checkSiteChoices({
  sites, source, signal, inaccessibleSites = new Set(), accessResults = new Map(),
}) {
  const unchecked = sites.filter(({ value }) => !accessResults.has(value));
  const checked = await Promise.allSettled(
    unchecked.map(({ value }) => checkSiteAccess({ value, source, signal })),
  );
  signal.throwIfAborted();
  unchecked.forEach(({ value }, index) => accessResults.set(value, checked[index]));
  const results = sites.map(({ value }) => accessResults.get(value));
  const inaccessible = new Set(inaccessibleSites);
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    if (result.value) inaccessible.delete(sites[index].value);
    else inaccessible.add(sites[index].value);
  });
  const errors = results.flatMap((result, index) => {
    if (result.status !== 'rejected') return [];
    const reason = typeof result.reason === 'string' && result.reason ? ` (${result.reason})` : '';
    return [result.reason?.message
      || `Could not verify access to ${sites[index].value}${reason}. Please try again.`];
  });
  return {
    sites: sites.filter(({ value }) => !inaccessible.has(value)),
    inaccessibleSites: inaccessible,
    error: errors.length ? errors.join(' ') : undefined,
  };
}

export async function addExistingSite({ value, source, signal }) {
  const accessible = await checkSiteAccess({ value, source, signal });
  if (!accessible) throw new Error('You do not have access to this site. Ask its administrator for access.');
  const [org, site] = value.split('/');
  const tokens = new Set();
  let continuationToken;
  do {
    signal.throwIfAborted();
    const result = await source.list(`/${org}`, { continuationToken, opts: { signal } });
    signal.throwIfAborted();
    if (!result.ok) throw new Error('Could not load sites. Check your sign-in and site permissions.');
    if (result.items.some((item) => item.name === site && !item.ext)) {
      setRecentSite({ org, site });
      return;
    }
    continuationToken = result.continuationToken;
    if (continuationToken && tokens.has(continuationToken)) {
      throw new Error('Site listing did not complete. Please try again.');
    }
    tokens.add(continuationToken);
  } while (continuationToken);
  throw new Error('This site was not found in your accessible sites. Check the URL or ask its administrator for access.');
}
