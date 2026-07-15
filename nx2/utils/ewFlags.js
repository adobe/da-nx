import { fetchDaConfigs } from './daConfig.js';

// Experience Workspace flags live in the `flags` sheet of the DA config docs,
// keyed `ew.*`. Site-level config overrides org-level (it is fetched last).
export async function getEWFlags({ org, site }) {
  try {
    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    const flags = {};
    for (const config of configs) {
      for (const { key, value } of config?.flags?.data ?? []) {
        if (key.startsWith('ew.')) flags[key] = value;
      }
    }
    return flags;
  } catch (e) {
    if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
  }
  return {};
}

// User-level opt-in to Experience Workspace, persisted in localStorage. Same
// effect as the site-level `ew.enabled` flag but scoped to this browser, so
// individual users can preview the new editor on sites that haven't been
// switched over yet.
const EW_USER_KEY = 'nx2:ew-user-enabled';

export function isEWUserEnabled() {
  try {
    return localStorage.getItem(EW_USER_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setEWUserEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(EW_USER_KEY, 'true');
    else localStorage.removeItem(EW_USER_KEY);
  } catch { /* storage disabled — no-op */ }
}

export async function isEWEnabledBySite({ org, site }) {
  const flags = await getEWFlags({ org, site });
  return flags['ew.enabled'] === 'true';
}

export async function isEWEnabled({ org, site }) {
  if (isEWUserEnabled()) return true;
  return isEWEnabledBySite({ org, site });
}

export async function isEwChatDisabled({ org, site }) {
  const flags = await getEWFlags({ org, site });
  return flags['ew.disableChat'] === 'true';
}
