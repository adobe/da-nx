import { CON_ORIGIN, daFetch } from '../../../utils/daFetch.js';

const STATIC_BRANCH_STORAGE_KEY = 'nx-canvas-static-branch';
const DEFAULT_STATIC_BRANCH = 'main';

/** Returns the branch used to serve preview static files (default `main`). */
export function getStaticBranch() {
  try {
    return sessionStorage.getItem(STATIC_BRANCH_STORAGE_KEY) || DEFAULT_STATIC_BRANCH;
  } catch {
    return DEFAULT_STATIC_BRANCH;
  }
}

/**
 * Persist the branch used for preview static files. An empty value resets
 * back to the default (`main`). Returns the normalized value actually saved.
 */
export function setStaticBranch(branch) {
  const normalized = (branch ?? '').trim() || DEFAULT_STATIC_BRANCH;
  try {
    if (normalized === DEFAULT_STATIC_BRANCH) sessionStorage.removeItem(STATIC_BRANCH_STORAGE_KEY);
    else sessionStorage.setItem(STATIC_BRANCH_STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
  return normalized;
}

export function getPreviewOrigin(org, repo) {
  const hostname = window?.location?.hostname ?? '';
  const domain = hostname.endsWith('aem.page') || hostname.endsWith('localhost')
    ? 'stage-preview.da.live'
    : 'preview.da.live';
  return `https://${getStaticBranch()}--${repo}--${org}.${domain}`;
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
