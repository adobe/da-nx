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

import DEFAULT_ASSET_BASE_PATH from './constants.js';

const RENDITION_REL = 'http://ns.adobe.com/adobecloud/rel/rendition';
const METADATA_REL = 'http://ns.adobe.com/adobecloud/rel/metadata/asset';

function resolveAssetBasePath(basePath = DEFAULT_ASSET_BASE_PATH) {
  const normalized = `/${basePath}`.replace(/^\/+/, '/').replace(/\/+$/, '');
  return normalized || DEFAULT_ASSET_BASE_PATH;
}

function getMimetype(asset) {
  return asset.mimetype || asset['dc:format'] || '';
}

function getSeoName(name) {
  return name.includes('.') ? name.split('.').slice(0, -1).join('.') : name;
}

function getMetadata(asset) {
  // eslint-disable-next-line no-underscore-dangle
  return asset?._embedded?.[METADATA_REL];
}

export function resolveRenditionType(mimetype, { mimeRenditionOverrides = {} } = {}) {
  const lower = (mimetype || '').toLowerCase();
  if (mimeRenditionOverrides[lower]) return mimeRenditionOverrides[lower];

  const prefix = lower.includes('/') ? `${lower.split('/')[0]}/*` : '';
  if (prefix && mimeRenditionOverrides[prefix]) return mimeRenditionOverrides[prefix];

  if (lower.startsWith('image/')) return 'avif';
  if (lower.startsWith('video/')) return 'play';

  return 'original';
}

export function buildAuthorUrl(asset, publishOrigin) {
  if (getMimetype(asset).startsWith('video/')) {
    // eslint-disable-next-line no-underscore-dangle
    const renditionLinks = asset._links?.[RENDITION_REL];
    const videoLink = renditionLinks?.find((link) => link.href.endsWith('/play'))?.href;
    return videoLink || `https://${publishOrigin}${asset.path}`;
  }
  return `https://${publishOrigin}${asset.path}`;
}

function buildRenditionUrl({ base, name, mimetype, renditionOptions }) {
  const renditionType = resolveRenditionType(mimetype, renditionOptions);
  if (renditionType === 'avif') return `${base}/as/${getSeoName(name)}.avif`;
  if (renditionType === 'play') return `${base}/play`;
  return `${base}/original/as/${name}`;
}

export function buildDmUrl(asset, host, basePath = DEFAULT_ASSET_BASE_PATH, renditionOptions = {}) {
  return buildRenditionUrl({
    base: `https://${host}${resolveAssetBasePath(basePath)}/${asset['repo:id']}`,
    name: asset.name,
    mimetype: getMimetype(asset),
    renditionOptions,
  });
}

export function buildDeliveryUrl(
  asset,
  overrideHost,
  basePath = DEFAULT_ASSET_BASE_PATH,
  renditionOptions = {},
) {
  const host = overrideHost || asset['repo:repositoryId'];
  return buildRenditionUrl({
    base: `https://${host}${resolveAssetBasePath(basePath)}/${asset['repo:assetId']}`,
    name: asset['repo:name'] || '',
    mimetype: getMimetype(asset),
    renditionOptions,
  });
}

export function buildSmartCropUrl(asset, dmOrigin, cropName, basePath = DEFAULT_ASSET_BASE_PATH) {
  const base = `https://${dmOrigin}${resolveAssetBasePath(basePath)}/${asset['repo:id']}`;
  return `${base}/as/${cropName}-${getSeoName(asset.name)}.avif?smartcrop=${cropName}`;
}

export function buildSmartCropsListUrl(asset, dmOrigin, basePath = DEFAULT_ASSET_BASE_PATH) {
  return `https://${dmOrigin}${resolveAssetBasePath(basePath)}/${asset['repo:id']}/smartCrops`;
}

export function getAssetAlt(asset) {
  const meta = getMetadata(asset);
  return meta?.['Iptc4xmpExt:ExtDescrAccessibility']
    || asset?.['Iptc4xmpExt:ExtDescrAccessibility']
    || meta?.['dc:description']
    || meta?.['dc:title']
    || asset?.['dc:title']?.['o:default']
    || asset?.['dc:title']
    || asset?.name
    || '';
}

export function getDmApprovalStatus(asset) {
  const meta = getMetadata(asset);
  return {
    status: meta?.['dam:assetStatus'],
    activationTarget: meta?.['dam:activationTarget'],
  };
}

export function getPublishedFlag(asset) {
  return asset?.['aem:published'];
}
