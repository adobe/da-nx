export default async function formatBasics(title, paths) {
  if (!title) return { error: 'Please enter a title' };

  if (!paths) return { error: 'Please add AEM URLs.' };

  // Split and de-dupe
  let urls = [...new Set(paths.split('\n'))];

  // Remove empties
  urls = urls.filter((url) => url);

  // Convert to proper URLs
  urls = urls.map((url) => new URL(url));

  // Get first hostname
  const { hostname } = urls[0];

  // Ensure all URLs have same hostname
  const filtered = urls.filter((url) => url.hostname === hostname);
  if (filtered.length !== urls.length) return { error: 'URLs are not from the same site.' };

  // Subdomain split
  const [site, org] = hostname.split('.')[0].split('--').slice(1).slice(-2);
  if (!(site || org)) return { error: 'Please use AEM URLs' };

  // Flatten down to pure pathnames
  const hrefs = urls.map((url) => ({ suppliedPath: url.pathname }));

  // Always set what view is next
  return { detail: { view: 'validate', org, site, title, urls: hrefs } };
}
