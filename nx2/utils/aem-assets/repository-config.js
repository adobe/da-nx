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

import { fetchDaConfigs, getFirstSheet } from '../daConfig.js';
import { isDynamicMediaEnabled, shouldFilterApprovedAssets } from './config.js';
import DEFAULT_ASSET_BASE_PATH from './constants.js';
import { parseSiteImageModifiers } from './image-modifiers.js';

export function parseMimeRenditions(configValue, defaults = {}) {
  const map = { ...defaults };
  if (!configValue) return map;
  configValue.split(/\s*,\s*/).forEach((entry) => {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) return;
    const mime = entry.slice(0, colonIdx).trim().toLowerCase();
    const rendition = entry.slice(colonIdx + 1).trim().toLowerCase();
    if (mime && rendition) map[mime] = rendition;
  });
  return map;
}

export async function getResponsiveImageConfig(owner, repo) {
  if (!(repo || owner)) return null;
  if (!owner) return false;
  const [orgConfig, siteConfig] = await Promise.all(
    fetchDaConfigs({ org: owner, site: repo }),
  );
  const responsiveImages = siteConfig?.['responsive-images'] || orgConfig?.['responsive-images'];
  if (!responsiveImages) return false;
  return responsiveImages.data.map((config) => ({
    ...config,
    crops: config.crops.split(/\s*,\s*/),
  }));
}

function resolveAssetOrigin({ repositoryId, tierType, customOrigin, isDmEnabled }) {
  if (customOrigin) return customOrigin;
  if (tierType === 'delivery') return repositoryId;
  if (isDmEnabled) return repositoryId.replace('author', 'delivery');
  return repositoryId.replace('author', 'publish');
}

export async function getRepositoryConfig(owner, repo) {
  if (!owner) return null;
  const configs = await Promise.all(fetchDaConfigs({ org: owner, site: repo }));
  const entries = configs.reverse().flatMap((config) => getFirstSheet(config) || []);
  const getValue = (key) => entries.find((conf) => conf.key === key)?.value || null;

  const repositoryId = getValue('aem.repositoryId');
  if (!repositoryId) return null;

  const tierType = repositoryId.startsWith('delivery') ? 'delivery' : 'author';
  const customOrigin = getValue('aem.assets.prod.origin');
  const smartCrop = getValue('aem.asset.smartcrop.select');
  const isDmEnabled = isDynamicMediaEnabled({
    repositoryId,
    customOrigin,
    dmDelivery: getValue('aem.asset.dm.delivery'),
    smartCrop,
  });

  return {
    repositoryId,
    tierType,
    assetOrigin: resolveAssetOrigin({ repositoryId, tierType, customOrigin, isDmEnabled }),
    assetBasePath: getValue('aem.assets.prod.basepath') || DEFAULT_ASSET_BASE_PATH,
    isDmEnabled,
    isSmartCrop: smartCrop === 'on',
    approvedOnly: shouldFilterApprovedAssets({
      tierType,
      isDmEnabled,
      configuredValue: getValue('aem.asset.dm.approvedonly'),
    }),
    insertAsLink: getValue('aem.assets.image.type') === 'link',
    mimeRenditionOverrides: parseMimeRenditions(getValue('aem.asset.mime.renditions')),
    siteImageModifiers: parseSiteImageModifiers(getValue('aem.asset.image.modifiers')),
  };
}
