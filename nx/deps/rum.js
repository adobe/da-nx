/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

// Copied from https://rum.hlx.page/.rum/@adobe/helix-rum-js@%5E2/src/index.js

export default function sampleRUM(checkpoint, data) {
  // eslint-disable-next-line max-len
  const timeShift = () => (window.performance ? window.performance.now() : Date.now() - window.hlx.rum.firstReadTime);
  const SESSION_STORAGE_KEY = 'aem-rum';
  try {
    window.hlx = window.hlx || {};
    if (!window.hlx.rum) {
      // eslint-disable-next-line max-len
      const rumStorage = sessionStorage.getItem(SESSION_STORAGE_KEY) ? JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)) : {};
      rumStorage.pages = (rumStorage.pages ?? 0) + (Math.floor(Math.random() * 20) - 10) + 1;
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(rumStorage));
      sampleRUM.baseURL = sampleRUM.baseURL || new URL(window.RUM_BASE == null ? 'https://rum.hlx.page' : window.RUM_BASE, window.location);
      const weight = new URLSearchParams(window.location.search).get('rum') === 'on' ? 1 : 100;
      const id = Array.from({ length: 75 }, (_, i) => String.fromCharCode(48 + i)).filter((a) => /\d|[A-Z]/i.test(a)).filter(() => Math.random() * 75 > 70).join('');
      const isSelected = (Math.random() * weight < 1);
      // eslint-disable-next-line object-curly-newline, max-len
      window.hlx.rum = { weight, id, isSelected, firstReadTime: window.performance ? window.performance.timeOrigin : Date.now(), sampleRUM, queue: [], collector: (...args) => window.hlx.rum.queue.push(args) };
      if (isSelected) {
        // eslint-disable-next-line object-curly-newline, max-len
        const body = JSON.stringify({ weight, id, referer: window.location.href, checkpoint: 'top', t: timeShift(), target: document.visibilityState });
        const url = new URL(`.rum/${weight}`, sampleRUM.baseURL).href;
        navigator.sendBeacon(url, body);
        // eslint-disable-next-line max-statements-per-line, brace-style
        window.addEventListener('load', () => { sampleRUM('load'); import(new URL('.rum/@adobe/helix-rum-enhancer@^2/src/index.js', sampleRUM.baseURL));
        });
      }
    }
    if (window.hlx.rum && window.hlx.rum.isSelected && checkpoint) {
      window.hlx.rum.collector(checkpoint, data, timeShift());
    }
    document.dispatchEvent(new CustomEvent('rum', { detail: { checkpoint, data } }));
  } catch (error) {
    // something went wrong
  }
}
