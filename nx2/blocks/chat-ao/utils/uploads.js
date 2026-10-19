import { loadIms } from '../../../utils/ims.js';
import { AO_HTTP_BASE, AO_WS_BASE } from '../ao-constants.js';

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

const AO_HOST_QUERY_PARAM = 'nx-chat-ao-host';

// Dev override: `?nx-chat-ao-host=local` (or `localhost:<port>`) targets an AO on this machine.
// Loopback only, so a crafted link can never send the user's IMS token to another host.
function getLocalAoHost(search) {
  const value = new URLSearchParams(search).get(AO_HOST_QUERY_PARAM);
  const hostPort = value === 'local' ? 'localhost:8090' : value;
  return /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(hostPort ?? '') ? hostPort : null;
}

export function resolveAoHttpBase(projectedProductContext, search = window.location.search) {
  const localHost = getLocalAoHost(search);
  if (localHost) return `http://${localHost}`;
  const loc = resolveAoLocation(projectedProductContext);
  return loc ? `https://agent-orchestrator-${loc.environment}-${loc.region}.adobe.io` : AO_HTTP_BASE;
}

export function resolveAoWsBase(projectedProductContext, search = window.location.search) {
  const localHost = getLocalAoHost(search);
  if (localHost) return `ws://${localHost}`;
  const loc = resolveAoLocation(projectedProductContext);
  return loc ? `wss://agent-orchestrator-${loc.environment}-${loc.region}.adobe.io` : AO_WS_BASE;
}

// Shared IMS -> {base, headers} composition every AO REST call needs.
export async function aoContext() {
  const { accessToken, userId, projectedProductContext } = await loadIms();
  const tenantId = getOrgId(projectedProductContext);
  return {
    base: resolveAoHttpBase(projectedProductContext),
    tenantId,
    userId,
    headers: {
      authorization: `Bearer ${accessToken?.token}`,
      'x-tenant-id': tenantId,
    },
  };
}

function base64ToBlob(base64, mediaType) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mediaType });
}

// POST /files/upload -> PUT the blob -> POST /finalize, per AO's Files API.
export async function uploadAttachment({ fileName, mediaType, dataBase64 }) {
  try {
    const { base, headers } = await aoContext();

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
