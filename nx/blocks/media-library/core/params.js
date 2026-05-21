export function isPerfEnabled() {
  const params = new URLSearchParams(window.location.search);
  const debugValue = params.get('debug');
  if (debugValue && debugValue.split(',').includes('perf')) {
    return true;
  }

  if (localStorage.getItem('debug:perf') === '1') {
    return true;
  }

  return false;
}

// Allows existing index to remain accessible during the rebuild
export function isFullRebuildRequested() {
  const params = new URLSearchParams(window.location.search);
  return params.get('full') === 'true';
}
