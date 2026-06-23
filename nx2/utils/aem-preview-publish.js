/*
 * Copyright 2026 Adobe. All rights reserved.
 * AEM admin preview / live (publish) flows aligned with da.live helpers.
 */
import { HLX_ADMIN, DA_ADMIN } from './utils.js';
import { daFetch } from './api.js';

const AEM_PERMISSION_TPL = '{"users":{"total":1,"limit":1,"offset":0,"data":[]},"data":{"total":1,"limit":1,"offset":0,"data":[{}]},":names":["users","data"],":version":3,":type":"multi-sheet"}';

async function fetchSidekickHosts(org, site) {
  const path = `/${org}/${site}/config.json`;
  const [owner, repo, ...parts] = path.slice(1).split('/');
  const name = parts.pop() || repo || owner;
  parts.push(name.replace('.html', ''));
  const url = `${HLX_ADMIN}/sidekick/${owner}/${repo}/main/${parts.join('/')}`;
  const resp = await daFetch({ url, opts: { method: 'GET' } });
  if (!resp.ok) return {};
  try {
    return await resp.json();
  } catch {
    return {};
  }
}

async function getAemHrefs(fullPath) {
  const [org, site, ...pathParts] = fullPath.slice(1).split('/');
  const pathname = `/${pathParts.join('/')}`;
  const { host, liveHost, previewHost: preview } = await fetchSidekickHosts(org, site);
  const prod = host || liveHost;
  if (!preview || !prod) return null;
  return {
    preview: new URL(pathname, `https://${preview}`),
    prod: new URL(pathname, `https://${prod}`),
  };
}

async function saveToAem(path, action) {
  const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
  const aemPath = parts.join('/');
  const url = `${HLX_ADMIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const resp = await daFetch({ url, opts: { method: 'POST' } });
  if (!resp.ok) {
    const { status } = resp;
    const authErr = [401, 403].includes(status);
    const message = authErr ? `Not authorized to ${action}.` : `Error during ${action}`;
    const xerror = resp.headers.get('x-error');
    const error = { action, status, type: 'error', message };
    if (xerror && !authErr) {
      error.details = xerror.replace('[admin] ', '').replace(/^Unable to preview '[^']*':\s*/, '');
    }
    return { error };
  }
  return resp.json();
}

/**
 * @param {{ org?: string, site?: string, path?: string }} state
 * @returns {string | null} Lowercased AEM path `/owner/repo/...` or null if incomplete.
 */
export function buildAemPathFromHashState(state) {
  const { org, site, path } = state || {};
  if (!org || !site || !path) return null;
  const segments = [org, site, ...path.split('/').filter(Boolean)].map((s) => s.toLowerCase());
  return `/${segments.join('/')}`;
}

/**
 * @param {{ message?: string, details?: string }} error
 * @returns {string}
 */
export function formatAemPreviewPublishError(error) {
  if (!error?.message) return 'Unknown error';
  return error.details ? `${error.message}: ${error.details}` : error.message;
}

/**
 * Preview (admin `preview`) or publish (`live` after a successful preview),
 * then resolve the URL to open.
 * @param {{ aemPath: string, action: 'preview' | 'publish' }} params
 * @returns {Promise<{ ok: true, url: string } | { ok: false, error: Record<string, unknown> }>}
 */
export async function runAemPreviewOrPublish({ aemPath, action }) {
  if (action !== 'preview' && action !== 'publish') {
    return { ok: false, error: { message: 'Invalid action', type: 'error' } };
  }

  const jsonPreview = await saveToAem(aemPath, 'preview');
  if (jsonPreview.error) {
    return { ok: false, error: jsonPreview.error };
  }

  let json = jsonPreview;
  if (action === 'publish') {
    json = await saveToAem(aemPath, 'live');
    if (json.error) {
      return { ok: false, error: json.error };
    }
  }

  const branch = action === 'publish' ? json.live : json.preview;
  const href = branch?.url;
  const aemHrefs = await getAemHrefs(aemPath);
  const tier = action === 'publish' ? 'prod' : 'preview';
  const url = (aemHrefs?.[tier] && json.webPath)
    ? `${aemHrefs[tier].origin}${json.webPath}`
    : href;

  if (!url) {
    return { ok: false, error: { message: 'Preview URL missing from response.', type: 'error' } };
  }

  return { ok: true, url };
}

/**
 * Writes a role-request entry for the current IMS user to the DA permission
 * requests file, so an admin can grant preview/publish access.
 * @param {string} org
 * @param {string} site
 * @param {string} action  'preview' | 'publish'
 * @returns {Promise<{ message: [string, string] }>}
 */
export async function requestAemRole(org, site, action) {
  const profile = await window.adobeIMS?.getProfile();
  if (!profile) {
    return {
      message: ['Could not get user profile.', 'Please sign in and try again.'],
    };
  }

  const url = `${DA_ADMIN}/source/${org}/${site}/.da/aem-permission-requests.json`;
  let json = JSON.parse(AEM_PERMISSION_TPL);
  const getResp = await daFetch({ url });
  if (getResp.ok) {
    try { json = await getResp.json(); } catch { /* fall back to template */ }
  }

  const entry = {
    Id: profile.userId,
    Email: profile.email,
    Name: profile.displayName || profile.name,
    Action: action,
    Requested: new Date().toISOString(),
  };
  const idx = json.users.data.findIndex((u) => u.Id === entry.Id);
  if (idx === -1) json.users.data.unshift(entry);
  else json.users.data[idx] = entry;

  const formData = new FormData();
  formData.append('data', new Blob([JSON.stringify(json)], { type: 'application/json' }));
  const postResp = await daFetch({ url, opts: { method: 'POST', body: formData } });

  if (!postResp.ok) {
    return {
      message: ['Could not request permissions.', 'Please notify your administrator.'],
    };
  }
  return { message: ['Successfully requested role!', 'An administrator will need to approve.'] };
}
