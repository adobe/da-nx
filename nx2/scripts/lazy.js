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

function rumWC(sampleRUM) {
  const wcs = document.querySelectorAll('[data-rum]');
  wcs.forEach((wc) => {
    wc.shadowRoot.addEventListener('click', (e) => {
      e.stopPropagation();
      const sourceEl = e.target.closest('a, button');
      const source = sourceEl?.title || sourceEl?.href || sourceEl?.dataset.action;
      if (!sampleRUM.targetselector) return;
      const target = sampleRUM.targetselector(e.target);
      sampleRUM('click', { source, target });
    });
  });
}

(async function loadLazy() {
  import('../deps/rum.js').then(({ sampleRUM }) => {
    sampleRUM();
    window.setTimeout(() => {
      rumWC(sampleRUM);
    }, 3000);
  });
}());
