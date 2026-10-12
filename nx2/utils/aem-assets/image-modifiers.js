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

const IMAGE_EXTENSIONS = new Set(['avif', 'webp', 'jpg', 'jpeg', 'png', 'gif']);

export function parseSiteImageModifiers(rawValue) {
  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim().replace(/^\?/, '');
  return trimmed || null;
}

function isAemAssetsDeliveryImageUrl(url) {
  if (!url.pathname.includes('/adobe/assets/')) return false;
  const path = url.pathname.toLowerCase();
  if (path.endsWith('/play') || path.endsWith('/play/')) return false;
  const lastSegment = path.split('/').pop() || '';
  const dotIdx = lastSegment.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = lastSegment.slice(dotIdx + 1);
  return IMAGE_EXTENSIONS.has(ext);
}

// Existing query params win, so per-asset overrides such as smartcrop are preserved.
export function applySiteImageModifiers(srcUrl, modifiers) {
  if (!srcUrl || !modifiers) return srcUrl;
  let url;
  try {
    url = new URL(srcUrl);
  } catch {
    return srcUrl;
  }
  if (!isAemAssetsDeliveryImageUrl(url)) return srcUrl;

  let modParams;
  try {
    modParams = new URLSearchParams(modifiers);
  } catch {
    return srcUrl;
  }

  let mutated = false;
  modParams.forEach((value, key) => {
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
      mutated = true;
    }
  });

  return mutated ? url.toString() : srcUrl;
}
