// True if ?debug=perf or localStorage debug:perf is set.
export function isPerfEnabled() {
  // 1. Check query param first (highest priority)
  // Works with:
  //   ?debug=perf
  //   ?debug=perf,state (comma-separated for multiple flags)
  // Examples:
  //   https://da.live/apps/media-library?debug=perf#/org/repo
  //   https://da.live/apps/media-library?nx=local&debug=perf#/org/repo
  const params = new URLSearchParams(window.location.search);
  const debugValue = params.get('debug');
  if (debugValue && debugValue.split(',').includes('perf')) {
    return true;
  }

  // 2. Check localStorage as fallback (for convenience during dev)
  // Enable via console: localStorage.setItem('debug:perf', '1')
  if (localStorage.getItem('debug:perf') === '1') {
    return true;
  }

  // 3. Default: disabled
  return false;
}

// True if ?full=true is set - forces full rebuild instead of incremental.
// This allows existing index to remain accessible during the 1.5hr rebuild.
// Examples:
//   https://da.live/apps/media-library?full=true#/org/repo
//   https://da.live/apps/media-library?nx=local&full=true#/org/repo
export function isFullRebuildRequested() {
  const params = new URLSearchParams(window.location.search);
  return params.get('full') === 'true';
}
