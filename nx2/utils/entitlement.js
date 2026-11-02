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
    return projectedProductContext.some((entry) => (
      entry?.prodCtx
      && typeof entry.prodCtx.serviceCode === 'string'
      && REQUIRED_SERVICE_CODES.includes(entry.prodCtx.serviceCode)
    ));
  } catch {
    return false;
  }
}
