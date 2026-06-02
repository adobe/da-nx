/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { getConfig } from '../scripts/nx.js';

const { env, imsClientId } = getConfig();

const EXC_ORIGINS = {
  dev: 'https://exc-unifiedcontent.experience-stage.adobe.net',
  stage: 'https://exc-unifiedcontent.experience-stage.adobe.net',
  prod: 'https://exc-unifiedcontent.experience.adobe.net',
};

const API_KEY = 'exc_app';

const QUERY = `
  query shellInitDataQuery {
    getSettings(appId: "userPreferences", groupId: "exc-preferences", level: "user", settings: {
      defaultOrg: "LAST_LOGGED_IN",
      showProductTours: true,
      trackProductTours: true
    }) {
      settings
    }
    getConsentPermissions(globalConsentPath: true, useMpsCache: true) {
      last_update_dts
      permissions {
        name
        enabled
        last_update_dts
      }
    }
  }
`;

async function fetchSettings(token) {
  const url = `${EXC_ORIGINS[env]}/api/gql/app/shell/graphql?appId=${imsClientId}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        operationName: 'shellInitDataQuery',
        query: QUERY,
        variables: {},
      }),
    });
    if (!resp.ok) return null;
    const { data } = await resp.json();
    return {
      settings: data?.getSettings?.settings ?? null,
      consents: data?.getConsentPermissions ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Loads user preferences and consent data from the Experience Cloud shell API.
 * Requires an authenticated IMS session — returns null for anonymous users or
 * when the request fails. Memoized: the network call is made at most once.
 * @returns {Promise<object|null>}
 */
export const loadUserSettings = (() => {
  let request;

  const load = async () => {
    const { loadIms } = await import('./ims.js');
    const ims = await loadIms().catch(() => null);
    if (!ims || ims.anonymous) return null;
    return fetchSettings(ims.accessToken.token);
  };

  return () => {
    request ??= load();
    return request;
  };
})();
