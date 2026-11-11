// Tools that work on the current site get the page's site hash (e.g. `#/org/site`).
const SITE_TOOL_HOSTS = ['da.live', 'author.aem.live'];

const parse = (href) => {
  try {
    return new URL(href, window.location.href);
  } catch {
    return undefined;
  }
};

// This site (relative links), da.live or author.aem.live.
export const isSiteTool = (href) => {
  const url = parse(href);
  if (!url) return false;
  return url.origin === window.location.origin || SITE_TOOL_HOSTS.includes(url.hostname);
};

// Replaces the url's hash with the page hash; unchanged without a page hash.
export const withSiteHash = (href) => {
  const { hash } = window.location;
  const url = parse(href);
  if (!hash || hash === '#' || !url) return href;
  url.hash = hash;
  return url.href;
};
