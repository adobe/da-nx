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

import { applySiteImageModifiers } from './image-modifiers.js';
import {
  buildAuthorUrl, buildDeliveryUrl, buildDmUrl,
  getAssetAlt, getDmApprovalStatus, getPublishedFlag,
} from './urls.js';

export const MISSING_FORMAT_ERROR_MSG = 'The selected asset has no format and cannot be used.';
export const DM_ERROR_MSG = 'The selected asset is not available because it is not approved for delivery. Please check the status.';
export const PUBLISH_ERROR_MSG = 'The selected asset is not available on the publish tier. Please publish the asset in AEM and try again.';

export function resolveAssetUrl(asset, repoConfig) {
  const {
    tierType, assetOrigin, assetBasePath, isDmEnabled,
    mimeRenditionOverrides, siteImageModifiers,
  } = repoConfig;
  const renditionOptions = { mimeRenditionOverrides };
  let url;
  if (tierType === 'delivery') {
    url = buildDeliveryUrl(asset, assetOrigin, assetBasePath, renditionOptions);
  } else if (isDmEnabled) {
    url = buildDmUrl(asset, assetOrigin, assetBasePath, renditionOptions);
  } else {
    url = buildAuthorUrl(asset, assetOrigin);
  }
  return applySiteImageModifiers(url, siteImageModifiers);
}

function isApprovedForDelivery(asset) {
  const { status, activationTarget } = getDmApprovalStatus(asset);
  return status === 'approved' && (!activationTarget || activationTarget === 'delivery');
}

function isPublished(asset) {
  return getPublishedFlag(asset) !== false;
}

export function resolveAssetSelection({ asset, repoConfig }) {
  if (!asset?.['aem:formatName']) return { error: MISSING_FORMAT_ERROR_MSG };

  if (repoConfig.tierType === 'author') {
    if (repoConfig.isDmEnabled && !isApprovedForDelivery(asset)) {
      return { error: DM_ERROR_MSG };
    }
    if (!repoConfig.isDmEnabled && !isPublished(asset)) return { error: PUBLISH_ERROR_MSG };
  }

  const mimetype = asset.mimetype || asset['dc:format'] || '';
  return {
    href: resolveAssetUrl(asset, repoConfig),
    isImage: mimetype.toLowerCase().startsWith('image/'),
    alt: getAssetAlt(asset),
  };
}
