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

import { getMetadata } from '../scripts/nx.js';

const LAUNCH_HOST = 'https://exc-unifiedcontent.experience-stage.adobe.net';
const LAUNCH_PATH = '/static/launch/d4d114c60e50/1bdb1b16530b'
  + '/launch-3e9e0f669557-development.min.js';
const ADOBE_LAUNCH_SRC = `${LAUNCH_HOST}${LAUNCH_PATH}`;

const OMEGA_NX_PREFIX = 'ew-omega-';
const DA_AUTHORING_PATHS = ['/canvas', '/browse'];

function isDaAuthoringPage() {
  const { hostname, pathname } = window.location;
  const isDaHost = hostname === 'da.live' || hostname === 'localhost';
  if (!isDaHost) return false;
  return DA_AUTHORING_PATHS.some((p) => pathname.startsWith(p));
}

function isOmegaNxBranchInQuery() {
  try {
    const nx = new URLSearchParams(window.location.search).get('nx');
    if (nx == null) return false;
    if (nx === 'ew') return true;
    return nx.startsWith(OMEGA_NX_PREFIX);
  } catch {
    return false;
  }
}

function trackingEnabled() {
  if (!isDaAuthoringPage()) return false;
  if (isOmegaNxBranchInQuery()) return true;
  return getMetadata('omega-tracking') === 'on';
}

function appendLaunchScript() {
  if (document.querySelector(`script[src="${ADOBE_LAUNCH_SRC}"]`)) return;
  const el = document.createElement('script');
  el.src = ADOBE_LAUNCH_SRC;
  el.async = true;
  document.body.append(el);
}

/**
 * Appends the Adobe Launch (Omega) stage bootstrap to the end of
 * {@link document.body}. Only fires on DA authoring pages
 * ({@code da.live/canvas}, {@code da.live/browse}, or localhost)
 * when {@code ?nx=ew} or {@code ?nx=ew-omega-*} is in the URL.
 */
export function initOmegaTracking() {
  if (!trackingEnabled()) return;
  appendLaunchScript();
}
