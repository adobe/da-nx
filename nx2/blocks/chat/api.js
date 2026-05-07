import { DA_ORIGIN, daFetch } from '../../utils/daFetch.js';

export async function loadSiteConfig(org, site) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${site}`);
    if (!resp.ok) return {};
    const json = await resp.json();
    const prompts = (json?.prompts?.data ?? []).filter((p) => p.title && p.prompt);
    const rows = json?.skills?.data ?? [];
    const skills = rows
      .filter((row) => String(row.status ?? '').trim().toLowerCase() !== 'draft')
      .map((row) => String(row.key ?? row.id ?? '').trim().replace(/\.md$/i, ''))
      .filter(Boolean);
    return { prompts, skills };
  } catch {
    return {};
  }
}
