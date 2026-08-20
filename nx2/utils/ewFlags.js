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

// Query param that seeds the flag, mirroring da-live's `?da-admin` pattern
// (see da-live blocks/shared/constants.js `getDaEnv`): visiting a page with
// `?ew=true` opts this browser in, `?ew=false` (or `?ew=reset`) opts out, and
// the choice is persisted to localStorage so it survives navigations that drop
// the param.
const EW_USER_PARAM = 'ew';

export function setEWUserEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(EW_USER_KEY, 'true');
    else localStorage.removeItem(EW_USER_KEY);
  } catch { /* storage disabled — no-op */ }
}

// Read `?ew` from the URL and persist it, mirroring da-live's getDaEnv: the
// param wins when present and is written through to localStorage. `location`
// is injectable for testing; defaults to the current page.
function syncEWUserFromQuery(location = window.location) {
  let value;
  try {
    value = new URL(location.href).searchParams.get(EW_USER_PARAM);
  } catch {
    return;
  }
  if (value === null) return;
  setEWUserEnabled(value !== 'false' && value !== 'reset');
}

export function isEWUserEnabled(location = window.location) {
  syncEWUserFromQuery(location);
  try {
    return localStorage.getItem(EW_USER_KEY) === 'true';
  } catch {
    return false;
  }
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

export async function isCoworkerEnabled({ org, site }) {
  const flags = await getEWFlags({ org, site });
  return flags['ew.coworker'] === 'true';
}
