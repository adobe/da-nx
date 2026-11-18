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
// Originally from @adobe/helix-rum-enhancer v2.50.0 (modules/dom.js) so forwarded iframe
// clicks carry `target` in the same format RUM records for host-page clicks
export const getTargetValue = (el) => el.getAttribute('data-rum-target') || el.getAttribute('href')
  || el.currentSrc || el.getAttribute('src') || el.dataset.action || el.action;

export const targetSelector = (el) => {
  try {
    if (!el) {
      return undefined;
    }
    let v = getTargetValue(el);
    if (!v && el.tagName !== 'A' && el.closest('a')) {
      v = getTargetValue(el.closest('a'));
    }
    if (v && !v.startsWith('https://')) {
      // resolve relative links
      v = new URL(v, window.location).href;
    }
    return v;
    /* c8 ignore next 3 */
  } catch (e) {
    return null;
  }
};
