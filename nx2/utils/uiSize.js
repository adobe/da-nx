// User-level UI text/icon size preference ("s" = current prod scale,
// "m" = the larger scale from #757/#1351), persisted in localStorage.
// Mirrors ewFlags.js's query-param-seeds-localStorage pattern. No toggle UI
// exists yet — this is set via `?uiSize=` while "m" awaits UX sign-off.
const UI_SIZE_KEY = 'ui-size';
const UI_SIZE_PARAM = 'uiSize';
const VALID_SIZES = ['s', 'm'];

export function setUISize(size) {
  try {
    if (VALID_SIZES.includes(size)) localStorage.setItem(UI_SIZE_KEY, size);
    else localStorage.removeItem(UI_SIZE_KEY);
  } catch { /* storage disabled — no-op */ }
}

// Read `?uiSize` from the URL and persist it: the param wins when present
// and is written through to localStorage so it survives navigations that
// drop the param. `location` is injectable for testing.
function syncUISizeFromQuery(location = window.location) {
  let value;
  try {
    value = new URL(location.href).searchParams.get(UI_SIZE_PARAM);
  } catch {
    return;
  }
  if (value === null) return;
  setUISize(value);
}

export function getUISize(location = window.location) {
  syncUISizeFromQuery(location);
  try {
    const stored = localStorage.getItem(UI_SIZE_KEY);
    return VALID_SIZES.includes(stored) ? stored : 's';
  } catch {
    return 's';
  }
}
