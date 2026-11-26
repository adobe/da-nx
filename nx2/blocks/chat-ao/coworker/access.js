import { loadIms } from '../../../utils/ims.js';
import { getOrgId } from '../utils/uploads.js';
import { resolveCoworkerAccessBase } from './endpoints.js';

const pendingChecks = new Map();

async function requestAccess({ base, orgId, token }) {
  const uri = `/orgs/${orgId}/apps/coworker/chat/*`;
  try {
    const resp = await fetch(`${base}/enforcement/cx-coworker`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-gw-ims-org-id': orgId,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ requests: [{ resource: { uri }, action: 'use' }] }),
      cache: 'no-store',
    });
    if (resp.status !== 200) return { error: 'http', status: resp.status };

    const json = await resp.json().catch(() => null);
    const decision = json?.responses?.[0];
    if (!Array.isArray(json?.responses) || json.responses.length !== 1
      || decision?.resource?.uri !== uri || decision?.action !== 'use'
      || !['permit', 'deny'].includes(decision?.effect)) {
      return { error: 'invalid-response', status: resp.status };
    }
    return { allowed: decision.effect === 'permit' };
  } catch {
    return { error: 'network' };
  }
}

export async function checkCoworkerAccess() {
  try {
    const { accessToken, userId, projectedProductContext } = await loadIms();
    const orgId = getOrgId(projectedProductContext);
    if (!accessToken?.token || !orgId) return { error: 'identity' };

    const base = resolveCoworkerAccessBase(projectedProductContext);
    if (!base) return { error: 'configuration' };

    const key = JSON.stringify([userId, orgId, base, accessToken.token]);
    if (!pendingChecks.has(key)) {
      pendingChecks.set(key, requestAccess({ base, orgId, token: accessToken.token })
        .finally(() => pendingChecks.delete(key)));
    }
    return await pendingChecks.get(key);
  } catch {
    return { error: 'identity' };
  }
}
