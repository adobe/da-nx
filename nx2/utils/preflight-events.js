/**
 * Cross-surface Preflight ↔ Publish contract (document-level CustomEvents).
 *
 * Shared by every Publish gate (EW `nx-ew-actions`, da.live classic `da-title`, bulk `da-list`)
 * and every Preflight surface (the prepare-menu dialog today, the EW side panel later). It is the
 * only coupling between publishing and preflight — nothing here depends on how Preflight computes
 * pass/fail.
 *
 * This is the single source of truth. da.live imports it at runtime via
 * `${getNx2()}/utils/preflight-events.js` (co-located with PANEL_EVENT / CHAT_EVENT), so there is
 * no duplicate copy to keep in sync.
 *
 * Flow:
 *   1. A Publish click (or bulk publish) dispatches `RUN` with `{ paths: string[], requestId }`.
 *      - single path  → Preflight runs interactively (opens its panel/dialog)
 *      - multiple paths → Preflight runs headless (no per-page UI)
 *   2. Preflight dispatches `STATUS` `{ path, status: 'success' | 'fail', requestId }` once per
 *      path as it completes. Consumers correlate by `requestId` (and/or `path`).
 */
export const PREFLIGHT_EVENT = Object.freeze({
  RUN: 'nx-preflight-run',
  STATUS: 'nx-preflight-status',
});

/** Small helper for correlating a run with its status events. */
export function newPreflightRequestId() {
  return `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
