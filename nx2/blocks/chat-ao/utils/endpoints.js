import { CMA_BRIDGE_HTTP_BASE, CMA_BRIDGE_WS_BASE } from '../ao-constants.js';
import { resolveAoHttpBase, resolveAoWsBase } from './uploads.js';

// Single place that maps a resolved harness to its backend base hosts (#962):
// CMA uses the bridge; coworker/AO uses the region-aware Agent Orchestrator
// base derived from the IMS profile. Kept next to the chat code (not in
// nx2/utils) so general utils don't depend on a chat block; mirrors the
// getEnv() resolver pattern in nx2/utils/utils.js.
export function resolveChatBases({ harness, projectedProductContext } = {}) {
  if (harness === 'cma') {
    return { httpBase: CMA_BRIDGE_HTTP_BASE, wsBase: CMA_BRIDGE_WS_BASE };
  }
  return {
    httpBase: resolveAoHttpBase(projectedProductContext),
    wsBase: resolveAoWsBase(projectedProductContext),
  };
}
