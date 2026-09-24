// Cross-repo Preflight ↔ Publish contract (da.live imports via getNx2()).
// RUN { paths, requestId } → STATUS { path, status, requestId } (one status per path).
export const PREFLIGHT_EVENT = Object.freeze({
  RUN: 'nx-preflight-run',
  STATUS: 'nx-preflight-status',
});

export function newPreflightRequestId() {
  return `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
