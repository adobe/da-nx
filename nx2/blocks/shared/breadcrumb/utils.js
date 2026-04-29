export function hashStateToPathSegments(state) {
  if (!state?.org || !state?.site) return undefined;
  const rest = (state.path || '').split('/').filter(Boolean);
  return [state.org, state.site, ...rest];
}

/**
 * With `baseUrl`, applies current `location.search` then `hash` (base has no query).
 */
export function resolveBreadcrumbHref({ baseUrl, hash }) {
  const h = hash.startsWith('#') ? hash : `#${hash}`;
  if (!baseUrl) return h;
  try {
    const doc = typeof window !== 'undefined' && window.location
      ? window.location.href
      : 'https://localhost/';
    const u = new URL(baseUrl, doc);
    if (typeof window !== 'undefined' && window.location) {
      u.search = window.location.search;
    }
    u.hash = h;
    return u.href;
  } catch {
    return h;
  }
}

export function pathSegmentsToCrumbs(segments, opts) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const baseUrl = opts?.baseUrl;
  const n = segments.length;
  return segments.map((label, i) => {
    if (i === n - 1) return { label, href: '' };
    const hash = i === 0
      ? `#/${segments[0]}/${segments[1]}`
      : `#/${segments.slice(0, i + 1).join('/')}`;
    return { label, href: resolveBreadcrumbHref({ baseUrl, hash }) };
  });
}
