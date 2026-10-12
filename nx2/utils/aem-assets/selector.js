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

import { loadScript } from '../utils.js';

export const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/static-assets/resources/assets-selectors.js';

const selectorLoads = new Map();

export function loadAssetSelector({ src = ASSET_SELECTOR_URL } = {}) {
  if (!selectorLoads.has(src)) {
    const load = loadScript(src)
      .then(() => ({ selectors: window.PureJSSelectors }))
      .catch(() => {
        selectorLoads.delete(src);
        document.head.querySelector(`script[src="${src}"]`)?.remove();
        return { error: 'The AEM Assets selector could not be loaded.' };
      });
    selectorLoads.set(src, load);
  }
  return selectorLoads.get(src);
}
