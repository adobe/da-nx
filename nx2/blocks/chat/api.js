import { DA_ADMIN } from '../../utils/utils.js';
import { daFetch } from '../../utils/api.js';

export async function loadPrompts(org, site) {
  try {
    const resp = await daFetch({ url: `${DA_ADMIN}/config/${org}/${site}` });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.prompts?.data ?? [];
  } catch {
    return null;
  }
}
