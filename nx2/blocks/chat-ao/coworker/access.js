import { aoContext } from '../utils/uploads.js';

const pendingChecks = new Map();

async function requestAccess({ base, headers, imsClientId }) {
  try {
    const resp = await fetch(`${base}/api/access`, {
      method: 'GET',
      headers: {
        ...headers,
        'x-api-key': imsClientId,
        accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (resp.status !== 200) return { error: 'http', status: resp.status };

    const json = await resp.json().catch(() => null);
    if (typeof json?.allowed !== 'boolean') {
      return { error: 'invalid-response', status: resp.status };
    }
    return { allowed: json.allowed };
  } catch {
    return { error: 'network' };
  }
}

export async function checkCoworkerAccess() {
  try {
    const {
      base, tenantId: orgId, userId, token, headers, imsClientId,
    } = await aoContext();
    if (!token || !orgId) return { error: 'identity' };
    if (!imsClientId) return { error: 'configuration' };

    const key = JSON.stringify([userId, orgId, base, token, imsClientId]);
    if (!pendingChecks.has(key)) {
      pendingChecks.set(key, requestAccess({ base, headers, imsClientId })
        .finally(() => pendingChecks.delete(key)));
    }
    return await pendingChecks.get(key);
  } catch {
    return { error: 'identity' };
  }
}
