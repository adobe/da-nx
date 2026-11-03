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
    // Must check entitlement on the SAME entry that will actually be sent as
    // `x-tenant-id` (see nx2/blocks/chat-ao/utils/uploads.js#getOrgId: the
    // first profile entry carrying an owningEntity). Checking *any* entry in
    // the array (the prior behavior) could return true off a different,
    // unselected org's service code while the selected/sent tenant has none —
    // the bridge's AUTH check requires prodCtx.owningEntity === tenantId for
    // whichever org it actually receives, so a mismatched selection here
    // passes the UI pre-check but still gets rejected server-side.
    const selected = projectedProductContext.find((entry) => entry?.prodCtx?.owningEntity);
    return !!(
      selected?.prodCtx
      && typeof selected.prodCtx.serviceCode === 'string'
      && REQUIRED_SERVICE_CODES.includes(selected.prodCtx.serviceCode)
    );
  } catch {
    return false;
  }
}
