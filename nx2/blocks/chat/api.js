import { DA_ORIGIN, daFetch } from '../../utils/daFetch.js';

export async function loadPrompts(org, site) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${site}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.prompts?.data ?? [];
  } catch {
    return null;
  }
}
