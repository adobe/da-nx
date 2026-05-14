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

import { env, getMetadata } from '../scripts/nx.js';

/** Adobe Experience Platform Launch (development) — Omega / unified content stage. */
const ADOBE_LAUNCH_SRC = 'https://exc-unifiedcontent.experience-stage.adobe.net/static/launch/d4d114c60e50/1bdb1b16530b/launch-3e9e0f669557-development.min.js';

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

/** Prod {@code nx} values that enable Omega without meta: {@code ew}, or any {@code ew-omega-…} branch. */
const OMEGA_NX_PREFIX = 'ew-omega-';

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
  if (env !== 'prod') return true;
  if (isOmegaNxBranchInQuery()) return true;
  return getMetadata('omega-tracking') === 'on';
}

function appendExternalScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const el = document.createElement('script');
  el.src = src;
  el.async = true;
  document.body.append(el);
}

function loadGoogleTagManager() {
  const id = (getMetadata('gtm-id') || '').trim();
  if (!id || !GTM_ID_PATTERN.test(id)) return;

  const gtmSrc = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  if (document.querySelector(`script[src="${gtmSrc}"]`)) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const g = document.createElement('script');
  g.async = true;
  g.src = gtmSrc;
  document.body.append(g);

  const noscript = document.createElement('noscript');
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}`;
  iframe.height = '0';
  iframe.width = '0';
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
  iframe.setAttribute('aria-hidden', 'true');
  noscript.append(iframe);
  document.body.append(noscript);
}

/**
 * Injects GTM (when head meta {@code gtm-id} is a valid {@code GTM-…} id) and Adobe
 * Launch by appending scripts to the **end of {@link document.body}**, not
 * {@link document.head}, so Omega can verify behaviour vs a typical head snippet.
 * On production hosts: enabled when the URL query has {@code nx=ew}, or {@code nx}
 * starting with {@code ew-omega-} (e.g. {@code nx=ew-omega-launch}), or when meta
 * {@code omega-tracking} is {@code on}.
 */
export function initOmegaTracking() {
  if (!trackingEnabled()) return;
  loadGoogleTagManager();
  appendExternalScript(ADOBE_LAUNCH_SRC);
}
