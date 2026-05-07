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

// ==== THIS IS PART OF SKILLS EDITOR V1 ====
function isServerEnabled(row) {
  if (typeof row?.enabled === 'boolean') return row.enabled;
  if (typeof row?.disabled === 'boolean') return !row.disabled;
  return true;
}

function isServerApproved(row) {
  const status = String(row?.status ?? '').trim().toLowerCase();
  return status !== 'draft';
}

export async function loadMcpServerConfig(org, site) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${site}`);
    if (!resp.ok) return { servers: {}, serverHeaders: {} };
    const json = await resp.json();
    const rows = json?.['mcp-servers']?.data ?? [];
    const servers = {};
    const serverHeaders = {};

    rows.forEach((row) => {
      const key = String(row?.key || '').trim();
      const url = String(row?.url || row?.value || '').trim();
      if (!key || !url || !isServerApproved(row) || !isServerEnabled(row)) return;
      servers[key] = url;

      const headerName = String(row?.authHeaderName || '').trim();
      const headerValue = String(row?.authHeaderValue || '').trim();
      if (headerName && headerValue) {
        serverHeaders[key] = { [headerName]: headerValue };
      }
    });

    return { servers, serverHeaders };
  } catch {
    return { servers: {}, serverHeaders: {} };
  }
}
// ==== END SKILLS EDITOR V1 ====
