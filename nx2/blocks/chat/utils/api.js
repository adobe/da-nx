import { daFetch } from '../../../utils/api.js';
import { DA_ADMIN } from '../../../utils/utils.js';

export async function loadSiteConfig(org, site) {
  try {
    const resp = await daFetch({ url: `${DA_ADMIN}/config/${org}/${site}` });
    if (!resp.ok) return {};
    const json = await resp.json();
    const prompts = (json?.prompts?.data ?? []).filter((p) => p.title && p.prompt);
    const rows = json?.skills?.data ?? [];
    const skills = rows
      .filter((row) => String(row.status ?? '').trim().toLowerCase() !== 'draft')
      .map((row) => String(row.key ?? row.id ?? '').trim().replace(/\.md$/i, ''))
      .filter(Boolean);

    const mcpServers = {};
    const mcpServerHeaders = {};
    (json?.['mcp-servers']?.data ?? []).forEach((row) => {
      const key = String(row?.key ?? '').trim();
      const url = row?.url || row?.value;
      const status = String(row?.status ?? '').trim().toLowerCase();
      const enabled = String(row?.enabled ?? 'true').trim().toLowerCase();
      if (!key || !url || status === 'draft' || enabled === 'false') return;
      mcpServers[key] = url;
      const hName = String(row?.authHeaderName ?? '').trim();
      const hValue = String(row?.authHeaderValue ?? '').trim();
      if (hName && hValue) mcpServerHeaders[key] = { [hName]: hValue };
    });

    return { prompts, skills, mcpServers, mcpServerHeaders };
  } catch {
    return {};
  }
}
