import { loadIms } from './ims.js';
import { getCoworkerConfig } from './ewFlags.js';

// Keep in sync with the bridge's auth.requiredServiceCodes allowlist
// (aem-sites-claudebridge, src/websocket/auth.ts#isEntitledTenant).
export const REQUIRED_SERVICE_CODES = ['acp', 'dma_tartan'];

// UI pre-check only, not a security boundary: the bridge re-verifies the same
// entitlement server-side on every AUTH frame. Fails closed on any error.
// Select the tenant getOrgId() picks (first entry with an owningEntity), then
// check any entry for that tenant for an allowed serviceCode.
export async function isCmaEntitled() {
  try {
    const { projectedProductContext } = await loadIms();
    if (!Array.isArray(projectedProductContext)) return false;
    const tenantId = projectedProductContext.find((entry) => entry?.prodCtx?.owningEntity)
      ?.prodCtx?.owningEntity;
    if (!tenantId) return false;
    return projectedProductContext.some((entry) => (
      entry?.prodCtx?.owningEntity === tenantId
      && typeof entry.prodCtx.serviceCode === 'string'
      && REQUIRED_SERVICE_CODES.includes(entry.prodCtx.serviceCode)
    ));
  } catch {
    return false;
  }
}

// True when the site requests the CMA harness (`ew.coworker=cma`) and the
// signed-in user is entitled. IMS is only consulted when CMA is requested.
export async function isCmaHarness({ org, site }) {
  const { harness } = await getCoworkerConfig({ org, site });
  return harness === 'cma' && isCmaEntitled();
}
