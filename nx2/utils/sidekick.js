/*
 * Copyright 2026 Adobe. All rights reserved.
 * AEM Sidekick cache-bust helper, shared by EW (ew-actions) and da.live's
 * classic editor (which imports this module by URL via getNx2()).
 */

// The AEM Sidekick browser extension id.
export const SK_EXT_ID = 'igkmdomcgoebiipaifhmpfjhbjccggml';

/**
 * Ask the AEM Sidekick extension to bust the author's disk cache for the host
 * of the given URL. Must run in the top-level document so the extension can be
 * reached via `chrome.runtime.sendMessage`. Fails silently when Chrome or the
 * extension is unavailable — a missing extension must never block the
 * preview/publish that opens the page.
 * @param {string} url the href about to be opened
 * @returns {Promise<void>}
 */
export async function sidekickCacheBust(url) {
  if (!window.chrome) return;
  try {
    const opts = { action: 'bustCache', host: new URL(url).hostname };
    const extId = window.localStorage.getItem('aem-sidekick-id') || SK_EXT_ID;

    // Tell AEM Sidekick to bust cache
    await window.chrome.runtime.sendMessage(extId, opts);
  } catch {
    // No-Op, fail silently
  }
}
