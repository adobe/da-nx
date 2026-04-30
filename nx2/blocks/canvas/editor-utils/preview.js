import { DA_CONTENT } from '../../../utils/utils.js';
import { daFetch } from '../../../utils/api.js';

export function getPreviewOrigin(org, repo) {
  const hostname = window?.location?.hostname ?? '';
  const domain = hostname.endsWith('aem.page') || hostname.endsWith('localhost')
    ? 'stage-preview.da.live'
    : 'preview.da.live';
  return `https://main--${repo}--${org}.${domain}`;
}

export async function fetchWysiwygCookie({ org, repo, token }) {
  if (!org || !repo || !token) {
    throw new Error('fetchWysiwygCookie: org, repo, and token required');
  }
  const previewUrl = `${getPreviewOrigin(org, repo)}/gimme_cookie`;
  const contentUrl = `${DA_CONTENT}/${org}/${repo}/.gimme_cookie`;

  const [previewResp, contentResp] = await Promise.all([
    daFetch({ url: previewUrl, opts: { method: 'GET', credentials: 'include', headers: { Authorization: `Bearer ${token}` } } }),
    daFetch({ url: contentUrl, opts: { method: 'GET', credentials: 'include' } }),
  ]);
  if (!previewResp.ok || !contentResp.ok) {
    throw new Error(
      `gimme_cookie failed: preview ${previewResp.status}, content ${contentResp.status}`,
    );
  }
}
