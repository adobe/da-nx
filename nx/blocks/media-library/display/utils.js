/**
 * Display-specific utilities that require DOM access.
 * These cannot be used in workers.
 */

import { initIms } from '../../../utils/daFetch.js';
import { Domains } from '../core/constants.js';
import { etcFetch, getLivePreviewUrl } from '../core/urls.js';

// Returns true if user has valid IMS auth for DA.
export async function ensureAuthenticated() {
  const imsResult = await initIms();

  if (!imsResult || imsResult.anonymous) {
    const { loadIms, handleSignIn } = await import('../../../utils/ims.js');
    await loadIms();
    handleSignIn();
    return false;
  }

  return true;
}

function shouldDebugLog() {
  const params = new URLSearchParams(window.location.search);
  const debugValue = params.get('debug');
  return debugValue?.split(',').includes('perf') || localStorage.getItem('debug:perf') === '1';
}

export function debugLog(message, data) {
  if (shouldDebugLog()) {
    // eslint-disable-next-line no-console
    console.log(`[MediaLibrary:Auth] ${message}`, data);
  }
}

function saveSiteAuthCache(cacheKey, result) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(result));
  } catch {
    // Ignore cache write errors
  }
}

export async function checkSiteAuthRequired(org, repo) {
  const cacheKey = `${org}-${repo}-auth-status`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const result = JSON.parse(cached);
      debugLog('Using cached auth check result', { org, repo });
      return result;
    }
  } catch {
    // Ignore cache read errors
  }

  const indexUrl = `https://main--${repo}--${org}${Domains.AEM_PAGE}/index.md`;

  debugLog('Checking site auth requirement', { org, repo, indexUrl });

  try {
    const response = await etcFetch(indexUrl, 'cors', { method: 'HEAD' });
    const requiresAuth = response.status === 401 || response.status === 403;
    const result = { requiresAuth, status: response.status };

    debugLog('Site auth check result', result);
    saveSiteAuthCache(cacheKey, result);
    return result;
  } catch (error) {
    debugLog('Site auth check error', error);
    const result = { requiresAuth: false, status: 0 };
    saveSiteAuthCache(cacheKey, result);
    return result;
  }
}

export async function livePreviewLogin(owner, repo) {
  try {
    const { accessToken } = await initIms();
    const url = `${getLivePreviewUrl(owner, repo)}/gimme_cookie`;

    debugLog('Setting preview.da.live cookie', { owner, repo, url });

    const response = await fetch(url, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken.token}` },
    });

    if (!response.ok) {
      debugLog('Preview.da.live login failed', { status: response.status });
      return false;
    }

    debugLog('Preview.da.live cookie set successfully');
    return true;
  } catch (error) {
    debugLog('Preview.da.live login failed', error);
    return false;
  }
}
