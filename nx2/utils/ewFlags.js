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

// One-time welcome guide for the new (canvas) editor. `pending` is armed the
// moment the user toggles EW on (see editortoggle.js) and consumed the next
// time canvas renders, so it survives the reload/path-swap the toggle does.
// `seen` is the permanent guard: once the guide has shown, re-toggling never
// re-arms it, so the welcome appears only the first time.
const EW_WELCOME_PENDING_KEY = 'nx2:ew-welcome-pending';
const EW_WELCOME_SEEN_KEY = 'nx2:ew-welcome-seen';

function hasSeenEwWelcome() {
  try {
    return localStorage.getItem(EW_WELCOME_SEEN_KEY) === 'true';
  } catch {
    // Storage unreadable — treat as seen so we never loop on the guide.
    return true;
  }
}

// Arm the welcome so canvas shows it after the toggle navigates there. No-op
// once the guide has already been seen, keeping it strictly first-time-only.
export function armEwWelcome() {
  if (hasSeenEwWelcome()) return;
  try {
    localStorage.setItem(EW_WELCOME_PENDING_KEY, 'true');
  } catch { /* storage disabled — no-op */ }
}

export function isEwWelcomePending() {
  try {
    return localStorage.getItem(EW_WELCOME_PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

// Clear the armed flag and permanently mark the guide as seen.
export function consumeEwWelcome() {
  try {
    localStorage.removeItem(EW_WELCOME_PENDING_KEY);
    localStorage.setItem(EW_WELCOME_SEEN_KEY, 'true');
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
