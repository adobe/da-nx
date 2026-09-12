import { loadIms } from '../../../utils/ims.js';
import {
  AO_HTTP_BASE, AO_WS_BASE, CMA_BRIDGE_WS_BASE, CMA_BRIDGE_HTTP_BASE,
} from '../ao-constants.js';

export function getOrgId(projectedProductContext) {
  return projectedProductContext?.find((p) => p.prodCtx?.owningEntity)?.prodCtx.owningEntity;
}

// Resolves the AO region from the IMS profile; null falls back to the default
// base — see docs/chat-ao-component.md#region-resolution.
function resolveAoLocation(projectedProductContext) {
  const found = projectedProductContext?.find(({ prodCtx } = {}) => prodCtx?.statusCode === 'ACTIVE'
    && (prodCtx?.serviceCode === 'acp' || prodCtx?.serviceCode === 'dma_tartan'));
  try {
    const { region, environment } = JSON.parse(found?.prodCtx?.fulfillable_data ?? 'null') ?? {};
    if (!region || !environment) return null;
    return { region: region.toLowerCase(), environment: environment.toLowerCase() };
  } catch {
    return null;
  }
}

export function resolveAoHttpBase(projectedProductContext) {
  const loc = resolveAoLocation(projectedProductContext);
  return loc ? `https://agent-orchestrator-${loc.environment}-${loc.region}.adobe.io` : AO_HTTP_BASE;
}

// When a valid `ew.altHarness` activation key is present the chat WebSocket is
// routed through the claudebridge -> CMA deployment instead of Agent
// Orchestrator. WS-only on purpose: the bridge implements only the WebSocket
// data plane, not the REST control plane (episodes/history/uploads), so the
// HTTP base stays on Agent Orchestrator. The key is a shared secret validated
// server-side by the bridge. See docs/chat-ao-alt-harness.md.
export function resolveAoWsBase(projectedProductContext, { altHarnessKey } = {}) {
  if (altHarnessKey) return CMA_BRIDGE_WS_BASE;
  const loc = resolveAoLocation(projectedProductContext);
  return loc ? `wss://agent-orchestrator-${loc.environment}-${loc.region}.adobe.io` : AO_WS_BASE;
}

// Skills management (catalog + overrides) routes to the bridge's REST plane
// when an `ew.altHarness` key is present, otherwise to Agent Orchestrator.
// Unlike resolveAoHttpBase (uploads/episodes stay on AO), the bridge *does*
// implement the skills control plane. Additive: no key => unchanged AO base.
export function resolveSkillsHttpBase(projectedProductContext, { altHarnessKey } = {}) {
  if (altHarnessKey) return CMA_BRIDGE_HTTP_BASE;
  return resolveAoHttpBase(projectedProductContext);
}

function base64ToBlob(base64, mediaType) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mediaType });
}

// POST /files/upload -> PUT the blob -> POST /finalize, per AO's Files API.
export async function uploadAttachment({ fileName, mediaType, dataBase64 }) {
  try {
    const { accessToken, projectedProductContext } = await loadIms();
    const headers = {
      authorization: `Bearer ${accessToken?.token}`,
      'x-tenant-id': getOrgId(projectedProductContext),
    };
    const base = resolveAoHttpBase(projectedProductContext);

    const initiate = await fetch(`${base}/api/v1/files/upload`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ filename: fileName, content_type: mediaType, scope: 'user' }),
    });
    if (!initiate.ok) return null;
    const { file_id: fileId, upload_url: uploadUrl } = await initiate.json();
    if (!fileId || !uploadUrl) return null;

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': mediaType, 'x-ms-blob-type': 'BlockBlob' },
      body: base64ToBlob(dataBase64, mediaType),
    });
    if (!put.ok) return null;

    const finalize = await fetch(`${base}/api/v1/files/${fileId}/finalize`, { method: 'POST', headers });
    if (!finalize.ok) return null;
    const { artifact_id: artifactId } = await finalize.json();
    return artifactId ?? null;
  } catch {
    return null;
  }
}
