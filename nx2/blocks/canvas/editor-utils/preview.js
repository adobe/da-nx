import { CON_ORIGIN, daFetch } from '../../../utils/daFetch.js';

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
  const contentUrl = `${CON_ORIGIN}/${org}/${repo}/.gimme_cookie`;

  const [previewResp, contentResp] = await Promise.all([
    daFetch(previewUrl, {
      method: 'GET',
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    }),
    daFetch(contentUrl, { method: 'GET', credentials: 'include' }),
  ]);
  if (!previewResp.ok || !contentResp.ok) {
    throw new Error(
      `gimme_cookie failed: preview ${previewResp.status}, content ${contentResp.status}`,
    );
  }
}
