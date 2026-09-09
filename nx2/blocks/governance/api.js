import { loadIms } from '../../utils/ims.js';
import { getConfig } from '../../scripts/nx.js';

const EVALUATE_URL = 'https://enterprise-context.adobe.io/api/v0/evaluate/page';

export async function evaluatePage({ href }) {
  const { accessToken } = await loadIms();
  if (!accessToken?.token) return { error: 'Not signed in.', status: 401 };

  const { imsClientId } = getConfig();

  try {
    const resp = await fetch(EVALUATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken.token}`,
        'x-api-key': imsClientId,
      },
      body: JSON.stringify({ url: href }),
    });
    if (!resp.ok) return { error: `Evaluation failed (${resp.status}).`, status: resp.status };
    const json = await resp.json();
    return { json };
  } catch (e) {
    return { error: e.message };
  }
}
