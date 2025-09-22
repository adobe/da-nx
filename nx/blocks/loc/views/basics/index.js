function getMessage(text) {
  return { text, type: 'error' };
}

/**
 * Parse hostname into parts separated by '--'
 * @param {string} hostname - The hostname to parse
 * @returns {string[]} Array of hostname parts
 */
function parseHostnameParts(hostname) {
  return hostname.split('.')[0].split('--');
}

/**
 * Transform a snapshot URL to the proper reviews format
 * @param {string} url - The URL to transform
 * @param {string} site - The site name
 * @param {string} org - The organization name
 * @returns {URL} The transformed URL
 */
function transformSnapshotUrl(url, site, org) {
  const properUrl = new URL(url);
  if (properUrl?.pathname.startsWith('/.snapshots/')) {
    const pathFragments = properUrl.pathname.split('/');
    if (pathFragments.length > 2) {
      const snapshotName = pathFragments[2];
      const newHostName = `${snapshotName}--main--${site}--${org}.aem.reviews`;
      return new URL(`${properUrl.protocol}//${newHostName}/${pathFragments.slice(3).join('/')}`);
    }
  }
  return properUrl;
}

/**
 * Extract site and organization from hostname
 * @param {string} hostname - The hostname to parse
 * @returns {Object} Object containing site and org
 */
function extractSiteAndOrg(hostname) {
  const parts = parseHostnameParts(hostname);
  const [site, org] = parts.slice(-2);
  return { site, org };
}

/**
 * Check if URL is a snapshot URL and extract snapshot name
 * @param {string} hostname - The hostname to check
 * @returns {string|undefined} The snapshot name or undefined
 */
function extractSnapshotName(hostname) {
  const parts = parseHostnameParts(hostname);
  return parts.length === 4 && hostname.includes('.reviews') ? parts[0] : undefined;
}

/**
 * Extract all relevant information from a URL
 * @param {string} url - The URL to analyze
 * @returns {Object} Object containing hostname, site, org, and snapshot
 */
function extractUrlInformation(url) {
  try {
    const { hostname } = new URL(url);
    const { site, org } = extractSiteAndOrg(hostname);
    const finalUrl = transformSnapshotUrl(url, site, org);
    const snapshot = extractSnapshotName(finalUrl.hostname);
    
    return {
      hostname: finalUrl.hostname,
      site,
      org,
      snapshot,
    };
  } catch (e) {
    return {};
  }
}

/**
 * Format and validate basic project information from title and URL paths
 * @param {string} title - The project title
 * @param {string} paths - Newline-separated list of AEM URLs
 * @returns {Object} Object containing either updates or error message
 */
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

  // Get first hostname
  const {
    hostname,
    site,
    org,
    snapshot,
  } = extractUrlInformation(urls[0]);

  if (!(site || org)) {
    return { message: getMessage('Please use AEM URLs') };
  }

  // Convert to proper URLs
  urls = urls.map((url) => {
    try {
      return transformSnapshotUrl(url, site, org);
    } catch (e) {
      return { error: true };
    }
  });
  const errors = urls.filter((url) => url.error);
  if (errors.length > 0) {
    return { message: getMessage('Please use AEM URLs.') };
  }

  // Ensure all URLs have same hostname
  const filtered = urls.filter((url) => url.hostname === hostname);
  if (filtered.length !== urls.length) return { message: getMessage('URLs are not from the same site.') };

  // Flatten down to pure pathnames
  const hrefs = urls.map((url) => ({ suppliedPath: url.pathname }));

  // Return the updates we want to persist
  return { updates: { org, site, snapshot, title, urls: hrefs } };
}
