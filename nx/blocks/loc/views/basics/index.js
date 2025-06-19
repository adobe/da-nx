function getMessage(text) {
  return { text, type: 'error' };
}

export default function formatBasics(title, paths) {
  if (!title) {
    return { message: getMessage('Please enter a title') };
  }

  if (!paths) {
    return { message: getMessage('Please add AEM URLs.') };
  }

  // Split and de-dupe
  let urls = [...new Set(paths.split('\n'))];

  // Remove empties
  urls = urls.filter((url) => url);

  // Convert to proper URLs
  urls = urls.map((url) => {
    try {
      return new URL(url);
    } catch (e) {
      return { error: true };
    }
  });
  const errors = urls.filter((url) => url.error);
  if (errors.length > 0) {
    return { message: getMessage('Please use AEM URLs.') };
  }

  // Get first hostname
  const { hostname } = urls[0];

  // Ensure all URLs have same hostname
  const filtered = urls.filter((url) => url.hostname === hostname);
  if (filtered.length !== urls.length) return { message: getMessage('URLs are not from the same site.') };

  // Subdomain split
  const [site, org] = hostname.split('.')[0].split('--').slice(1).slice(-2);
  if (!(site || org)) {
    return { message: getMessage('Please use AEM URLs') };
  }

  // Flatten down to pure pathnames
  const hrefs = urls.map((url) => ({ suppliedPath: url.pathname }));

  // Return the updates we want to persist
  return { updates: { org, site, title, urls: hrefs } };
}
