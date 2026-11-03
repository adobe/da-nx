import { loadIms } from './ims.js';

// Mirrors the bridge's `auth.requiredServiceCodes` allowlist exactly
// (Adobe-AEM-Sites/aem-sites-claudebridge, config/production.json /
// config/development.json), which is what actually gates a CMA session
// server-side (src/websocket/auth.ts#isEntitledTenant). Keep this list in
// sync with that config if it ever changes there.
export const REQUIRED_SERVICE_CODES = ['acp', 'dma_tartan'];

/**
 * Whether the signed-in user's IMS org is entitled to the CMA bridge harness
 * — i.e. carries a `projectedProductContext` entry with one of
 * `REQUIRED_SERVICE_CODES`, exactly the check the bridge itself performs.
 *
 * This is a **UI pre-check only, not a security boundary**: it decides which
 * chat harness component to render. The bridge independently re-verifies the
 * identical entitlement server-side on every `AUTH` frame and fails closed
 * regardless of what the client believes — a stale or wrong read here can at
 * most show the wrong harness in the UI, never grant access to a session for
 * a non-entitled org. Fails closed (returns false) on any IMS/profile error,
 * so a transient failure falls back to the existing non-CMA chat path rather
 * than silently granting the CMA harness.
 */
export async function isCmaEntitled() {
  try {
    const { projectedProductContext } = await loadIms();
    if (!Array.isArray(projectedProductContext)) return false;
    // IMS returns one projectedProductContext entry PER PRODUCT the profile
    // carries, not one per org — the same org/owningEntity can appear many
    // times with different serviceCodes. Must mirror the bridge's own check
    // (src/websocket/auth.ts#isEntitledTenant) exactly: select the tenant the
    // same way getOrgId() does (first entry with an owningEntity), then check
    // whether ANY entry for that SAME owningEntity has an allowed serviceCode
    // — not just the first matching entry overall (too loose — could pass off
    // a different, unselected org's entitlement) and not just the first
    // entry's own serviceCode (too strict — misses a later entry for the same
    // org, which is the common case: a profile with many product
    // entitlements for one org, CMA's just one of them).
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
