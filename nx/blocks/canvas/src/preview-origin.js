/**
 * Preview host for WYSIWYG iframe and gimme_cookie (mirrors da-nx getLivePreviewUrl).
 * Stage when the app runs on *.aem.page; production otherwise.
 * @param {string} org
 * @param {string} repo
 * @returns {string} Origin e.g. https://main--repo--org.preview.da.live
 */
export function getPreviewOrigin(org, repo) {
  const hostname = window?.location?.hostname ?? '';
  const domain = hostname.endsWith('aem.page') || hostname.endsWith('localhost')
    ? 'stage-preview.da.live'
    : 'preview.da.live';
  return `https://main--${repo}--${org}.${domain}`;
}
