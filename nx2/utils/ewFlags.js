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

export async function isEWEnabled({ org, site }) {
  const flags = await getEWFlags({ org, site });
  return flags['ew.enabled'] === 'true';
}

export async function isEwChatDisabled({ org, site }) {
  const flags = await getEWFlags({ org, site });
  return flags['ew.disableChat'] === 'true';
}
