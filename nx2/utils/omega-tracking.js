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

const { imsClientId } = getConfig();

const LAUNCH_HOST = 'https://assets.adobedtm.com';
const LAUNCH_PATH = '/d4d114c60e50/02a795757a26/launch-55fd4f558136.min.js';
const ADOBE_LAUNCH_SRC = `${LAUNCH_HOST}${LAUNCH_PATH}`;

const DA_AUTHORING_PATHS = ['/canvas', '/edit'];

const OMEGA_SUITE = 'aem';

function isDaAuthoringPage() {
  const { hostname, pathname } = window.location;
  const isDaHost = hostname === 'da.live' || hostname === 'localhost';
  if (!isDaHost) return false;
  return DA_AUTHORING_PATHS.some((p) => pathname.startsWith(p));
}

function trackingEnabled() {
  return isDaAuthoringPage();
}

const CONSENT_PERMISSIONS = ['globalDataCollectionAndUsage', 'adobeUsageDataCollection'];

function hasTrackingConsent(consents) {
  if (!consents?.permissions) return false;
  return CONSENT_PERMISSIONS.every(
    (name) => consents.permissions.find((p) => p.name === name)?.enabled === true,
  );
}

function appendLaunchScript() {
  if (document.querySelector(`script[src="${ADOBE_LAUNCH_SRC}"]`)) return;
  const el = document.createElement('script');
  el.src = ADOBE_LAUNCH_SRC;
  el.async = true;
  document.body.append(el);
}

async function buildDigitalData(ims) {
  const orgsData = await ims.getOrgs().catch(() => null);
  const currentOrg = orgsData?.data?.find((org) => org.userId === ims.userId);
  const language = document.documentElement.lang?.toLowerCase().replace('-', ':') || 'en:us';
  const { pathname } = window.location;
  return {
    user: {
      id: ims.userId,
      corpId: currentOrg?.owningOrgId,
      corpName: currentOrg?.description,
      internal: ims.email?.endsWith('@adobe.com') ?? false,
      authSystem: 'ims',
      accountType: currentOrg?.role,
      language,
      auth: 'authenticated',
      privileges: ['user'],
    },
    unifiedShell: {
      config: {
        user: {
          accountType: ims?.account_type,
        },
        metricsConfig: {
          user: { accountType: ims?.account_type },
        },
        appId: imsClientId,
        gainsight: {},
        imsinfo: {},
      },
    },
    page: {
      solution: { name: pathname.includes('canvas') ? 'Experience Workspace' : 'Darkalley' },
    },
  };
}

async function buildAdobeMetrics(ims) {
  return {
    metricsState: {
      environment: 'prod',
      user: {
        auth_id: ims.userId,
        account_type: 'end user',
      },
    },
  };
}

function buildShellGainsight(ims, userSettings) {
  const permissionsMap = Object.fromEntries(
    (userSettings?.consents?.permissions ?? []).map(({ name, enabled }) => [name, enabled]),
  );
  return {
    appId: imsClientId,
    enabled: permissionsMap.gainsightUsageDataCollection ?? false,
    environment: 'prod',
    fulfillableItems: [],
    omegaSuiteId: OMEGA_SUITE,
    user: {
      authId: ims.userId,
      internal: ims.email?.endsWith('@adobe.com') ?? false,
      permissions: permissionsMap,
      roles: null,
      theme: userSettings?.settings?.theme || 'light',
      triggers: [],
    },
  };
}

/**
 * Appends the Adobe Launch (Omega) stage bootstrap to the end of
 * {@link document.body}. Only fires on DA authoring pages
 * ({@code da.live/canvas}, {@code da.live/browse}, or localhost)
 * when {@code ?nx=ew} or {@code ?nx=ew-omega-*} is in the URL.
 */
export async function initOmegaTracking() {
  if (!trackingEnabled()) return;

  const { loadIms } = await import('./ims.js');
  const { loadUserSettings } = await import('./user-settings.js');
  const [ims, userSettings] = await Promise.all([
    loadIms().catch(() => null),
    loadUserSettings().catch(() => null),
  ]);

  if (!hasTrackingConsent(userSettings?.consents)) return;

  if (ims && !ims.anonymous) {
    window.digitalData = await buildDigitalData(ims);
    window.adobeMetrics = await buildAdobeMetrics(ims);
    window.shellGainsight = await buildShellGainsight(ims);
    appendLaunchScript();

    // eslint-disable-next-line no-underscore-dangle
    setTimeout(() => { window._satellite?.setVar('consentPrefVal', true); }, 500);
  }
}

/**
 * Fires a PDH interaction event via Adobe Launch.
 * @see https://wiki.corp.adobe.com/spaces/OMEGA/pages/3189390074/
 * @param {string} feature - Name of the feature where the interaction takes place
 * @param {{ name: string, type: string }} widget - Widget the element belongs to.
 *   `name`: friendly name for the element group e.g. "create offer".
 *   `type`: widget type, mirrors CoralUI components e.g. "panel", "accordion".
 * @param {string} element - Name of the UI element interacted with e.g. "create button".
 * @param {string} type - Type of the element e.g. "list item", "calendar date".
 * @param {string} action - DOM-style action without the "on" prefix e.g. "click", "submit", "drop".
 */
export function trackEvent(feature, widget, element, type, action) {
  if (!window.digitalData) return;

  const { pathname } = window.location;
  const featurePreview = pathname.includes('canvas') ? 'experience-workspace:' : 'darkalley:';
  const featureName = !feature.startsWith(featurePreview) ? featurePreview + feature : feature;

  // eslint-disable-next-line no-underscore-dangle
  window._satellite.track('event', {
    feature: featureName,
    element,
    type,
    action,
    widget,
  });
}
