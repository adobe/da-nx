import DaUrl from '../../utils/daUrl.js';

function getMessage(text) {
  return { text, type: 'error' };
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
  let hrefs = [...new Set(paths.split('\n'))];

  // Remove empties
  hrefs = hrefs.filter((href) => href);

  // Map to DA URLs
  const daUrls = hrefs.map((href) => new DaUrl(href));

  // Pull the first URL
  const { org, site } = daUrls[0].supplied;

  // Check that they're compatible
  if (!(site || org)) {
    return { message: getMessage('Please use AEM URLs') };
  }

  // Check for any parsing errors
  const urlError = daUrls.find((url) => url.error);
  if (urlError) return { message: getMessage(urlError.supplied.error) };

  // Ensure all other URLs match the project
  const filtered = daUrls.filter(({ supplied }) => org === supplied.org && site === supplied.site);
  if (filtered.length !== hrefs.length) return { message: getMessage('URLs are not from the same site.') };

  // We only support a single snapshot for now.
  const snapshotUrl = daUrls.find(({ supplied }) => supplied.snapshot);
  const snapshot = snapshotUrl?.supplied.snapshot;

  // Create an object for each href. We will store state with these.
  const urls = hrefs.map((href) => ({ href }));

  // Return the updates we want to persist
  return { updates: { org, site, snapshot, title, urls } };
}
