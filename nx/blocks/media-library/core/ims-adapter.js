/**
 * IMS adapter for media-library
 * Supports plugin mode token injection and falls back to nx2/utils/ims.js for app mode
 */

let cachedImsDetails;
let imsLoadPromise;
let isRedirectingToSignIn = false;

/**
 * Inject IMS token for plugin mode
 * @param {string} token - Bearer token from plugin host
 */
export function setImsDetails(token) {
  console.log('[IMS-Adapter] setImsDetails called with token:', token ? `${token.substring(0, 20)}...` : 'null');
  cachedImsDetails = { accessToken: { token } };
  imsLoadPromise = Promise.resolve(cachedImsDetails);
}

/**
 * Initialize IMS authentication
 * @returns {Promise<Object|null>} IMS details with accessToken
 */
export async function initIms() {
  if (cachedImsDetails && !cachedImsDetails.anonymous) return cachedImsDetails;
  if (imsLoadPromise) return imsLoadPromise;

  imsLoadPromise = (async () => {
    const { loadIms } = await import('../../../../nx2/utils/ims.js');
    try {
      const imsDetails = await loadIms();

      // Only cache authenticated sessions
      if (imsDetails && !imsDetails.anonymous) {
        cachedImsDetails = imsDetails;
      }
      return imsDetails;
    } catch (_) {
      // Fallback: if IMS timeout but token exists in window, use it
      if (window.adobeIMS?.getAccessToken) {
        const activeToken = window.adobeIMS.getAccessToken();
        if (activeToken) {
          const accessToken = typeof activeToken === 'string' ? { token: activeToken } : activeToken;
          const fallbackDetails = { accessToken, anonymous: false };
          cachedImsDetails = fallbackDetails;
          return fallbackDetails;
        }
      }

      imsLoadPromise = null;
      return null;
    }
  })();

  return imsLoadPromise;
}

/**
 * Authenticated fetch with IMS token
 * @param {string} url - URL to fetch
 * @param {Object} opts - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export const daFetch = async (url, opts = {}) => {
  opts.headers ||= {};

  // Add auth header if user is authenticated
  const hasAuthSession = !!localStorage.getItem('nx-ims');
  console.log('[IMS-Adapter] daFetch: hasAuthSession:', hasAuthSession, 'cachedImsDetails:', !!cachedImsDetails);
  if (hasAuthSession || cachedImsDetails) {
    const imsDetails = await initIms();
    if (imsDetails && !imsDetails.anonymous && imsDetails.accessToken) {
      opts.headers.Authorization = `Bearer ${imsDetails.accessToken.token}`;
      console.log('[IMS-Adapter] Authorization header added:', `Bearer ${imsDetails.accessToken.token.substring(0, 20)}...`);
    }
  }

  let response;
  try {
    response = await fetch(url, opts);
  } catch (err) {
    response = new Response(null, { status: 500, statusText: err.message });
  }

  // Smart 401 handling: auto-redirect for anonymous users, show error for authenticated users
  if (response.status === 401) {
    const returningFromSignIn = new URLSearchParams(window.location.search).get('from_ims') === 'true'
      || window.location.hash.includes('from_ims=true');

    if (!returningFromSignIn) {
      const userHasAuthSession = !!localStorage.getItem('nx-ims');
      const hasActiveToken = !!window.adobeIMS?.getAccessToken?.();

      if (!userHasAuthSession && !hasActiveToken && !isRedirectingToSignIn) {
        // Anonymous user - auto-redirect to sign-in
        isRedirectingToSignIn = true;
        const { handleSignIn } = await import('../../../../nx2/utils/ims.js');
        handleSignIn();
      }
    }
  }

  // Add DA permissions metadata
  response.permissions = response.headers.get('x-da-actions')?.split('=').pop().split(',');

  return response;
};
