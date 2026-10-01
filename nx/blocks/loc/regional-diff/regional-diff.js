import { getPathDetails, fetchConfig } from '../utils/utils.js';
import { regionalDiff as diff } from './diff.js';

export { normalizeLinks, removeLocTags } from './diff.js';

export async function regionalDiff(
  original,
  modified,
  acceptedHashes,
  rejectedHashes,
  { normalizeImages, org, site } = {},
) {
  const context = org && site ? { org, site } : getPathDetails();
  const config = await fetchConfig(context.org, context.site);
  return diff({
    original, modified, acceptedHashes, rejectedHashes, site: context.site, config, normalizeImages,
  });
}
