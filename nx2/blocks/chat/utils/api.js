import { fetchDaConfigs } from '../../../utils/daConfig.js';

export async function loadSiteConfig(org, site) {
  try {
    const configs = fetchDaConfigs({ org, site });
    const siteJson = await configs[configs.length - 1];
    if (!siteJson || siteJson.error) return {};

    const prompts = (siteJson?.prompts?.data ?? [])
      .filter((p) => p.title && p.prompt);
    const rows = siteJson?.skills?.data ?? [];
    const skills = rows
      .filter((r) => {
        const s = String(r.status ?? '').trim().toLowerCase();
        return s !== 'draft';
      })
      .map((r) => String(r.key ?? r.id ?? '').trim()
        .replace(/\.md$/i, ''))
      .filter(Boolean);

    const mcpServers = {};
    const mcpServerHeaders = {};
    (siteJson?.['mcp-servers']?.data ?? []).forEach((row) => {
      const key = String(row?.key ?? '').trim();
      const url = row?.url || row?.value;
      const st = String(row?.status ?? '').trim().toLowerCase();
      const en = String(row?.enabled ?? 'true').trim().toLowerCase();
      if (!key || !url || st === 'draft' || en === 'false') return;
      mcpServers[key] = url;
      // headers[] array (new format) → Record<string, string>; legacy single-header fallback
      const parsedHeaders = {};
      if (Array.isArray(row?.headers)) {
        row.headers.forEach((header) => {
          const headerName = String(header?.name || '').trim();
          const headerValue = String(header?.value || '').trim();
          if (headerName && headerValue) parsedHeaders[headerName] = headerValue;
        });
      }
      const legacyName = String(row?.authHeaderName ?? '').trim();
      const legacyValue = String(row?.authHeaderValue ?? '').trim();
      if (legacyName && legacyValue && !(legacyName in parsedHeaders)) {
        parsedHeaders[legacyName] = legacyValue;
      }
      if (Object.keys(parsedHeaders).length) mcpServerHeaders[key] = parsedHeaders;
    });

    return { prompts, skills, mcpServers, mcpServerHeaders };
  } catch {
    return {};
  }
}
