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

import { loadArea, setConfig } from './nx.js';

const hostnames = ['nx.live'];

const locales = {
  '': { title: 'English', lang: 'en' },
  de: { title: 'Deutsch', lang: 'de' },
  fr: { title: 'French', lang: 'fr' },
};

const linkBlocks = [
  { fragment: '/fragments/' },
  { 'action-button': '/tools/widgets/panel' },
];

const imsClientId = 'nexter';
const imsScope = 'ab.manage,AdobeID,gnav,openid,org.read,read_organizations,session,additional_info.ownerOrg,additional_info.projectedProductContext,account_cluster.read';

// How to decorate an area before loading it
const decorateArea = ({ area = document }) => {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    if (!img) return;
    img.removeAttribute('loading');
    img.fetchPriority = 'high';
  };

  eagerLoad(area, 'img');
};

const conf = {
  hostnames,
  locales,
  imsClientId,
  imsScope,
  linkBlocks,
  decorateArea,
};

export async function loadPage() {
  await setConfig(conf);
  await loadArea();
}
await loadPage();
