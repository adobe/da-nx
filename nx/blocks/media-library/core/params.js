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

export function isVerboseEnabled() {
  const params = new URLSearchParams(window.location.search);
  const debugValue = params.get('debug');
  if (debugValue && debugValue.split(',').includes('verbose')) {
    return true;
  }
  return localStorage.getItem('debug:verbose') === '1';
}

export function isStatusApiEnabled() {
  // 1. Check query param first (highest priority)
  // Works with:
  //   ?status=true
  // Examples:
  //   https://da.live/apps/media-library?status=true#/org/repo
  //   https://da.live/apps/media-library?status=true&debug=perf#/org/repo
  const params = new URLSearchParams(window.location.search);
  const statusValue = params.get('status');
  if (statusValue === 'true') {
    return true;
  }

  // 2. Check localStorage as fallback (for convenience during dev)
  // Enable via console: localStorage.setItem('indexing:status', '1')
  if (localStorage.getItem('indexing:status') === '1') {
    return true;
  }

  // 3. Default: disabled (use audit log)
  return false;
}
