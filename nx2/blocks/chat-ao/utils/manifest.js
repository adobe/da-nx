import { loadIms } from '../../../utils/ims.js';
import { getManifestId as getConfiguredManifestId } from '../../../utils/ewFlags.js';
import { AO_MANIFEST_ID } from '../ao-constants.js';
import { getOrgId, resolveAoHttpBase } from './uploads.js';

const MANIFEST_QUERY_PARAM = 'nx-chat-ao-manifest';

const RESOLVED_MANIFEST_CACHE_PREFIX = 'da-chat-ao-resolved-manifest';

function getResolvedManifestCacheKey(tenantId, userId) {
  return tenantId && userId ? `${RESOLVED_MANIFEST_CACHE_PREFIX}--${tenantId}--${userId}` : null;
}

// See docs/chat-ao-component.md#manifest-override. A resolved null is
// cached as '', distinct from never having asked (no key at all).
export async function fetchResolvedManifestId() {
  try {
    const { accessToken, userId, projectedProductContext } = await loadIms();
    const tenantId = getOrgId(projectedProductContext);
    const cacheKey = getResolvedManifestCacheKey(tenantId, userId);
    if (cacheKey) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached !== null) return cached || null;
    }

    const base = resolveAoHttpBase(projectedProductContext);
    const resp = await fetch(`${base}/api/v1/overrides/user/resolved`, {
      headers: {
        authorization: `Bearer ${accessToken?.token}`,
        'x-tenant-id': tenantId,
      },
    });
    if (!resp.ok) return null;
    const { manifest_id: manifestId } = await resp.json();

    if (cacheKey) {
      try {
        sessionStorage.setItem(cacheKey, manifestId ?? '');
      } catch {
        // best-effort — sessionStorage can throw (quota, private mode); safe to ignore
      }
    }
    return manifestId ?? null;
  } catch {
    return null;
  }
}

// See docs/chat-ao-component.md#manifest-override. debugMode is true only
// for the two explicit override tiers, not AO's own resolution or the default.
export async function resolveManifestId({ org, site, search = window.location.search } = {}) {
  const queryManifest = new URLSearchParams(search).get(MANIFEST_QUERY_PARAM);
  if (queryManifest) return { manifestId: queryManifest, debugMode: true };

  const configManifest = (org && site) ? await getConfiguredManifestId({ org, site }) : null;
  if (configManifest) return { manifestId: configManifest, debugMode: true };

  const resolvedManifest = await fetchResolvedManifestId();
  if (resolvedManifest) return { manifestId: resolvedManifest, debugMode: false };

  return { manifestId: AO_MANIFEST_ID, debugMode: false };
}
