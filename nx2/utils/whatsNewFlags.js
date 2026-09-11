// Tracks which what's-new entry the user last saw, so the dialog can
// auto-open only when there's something newer than that. Not EW-specific
// (see ewFlags.js) — the what's-new nav item can be authored onto any page.
const WHATSNEW_LAST_SEEN_KEY = 'nx2:whatsnew-last-seen';

export function getWhatsNewLastSeen() {
  try {
    return localStorage.getItem(WHATSNEW_LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function setWhatsNewLastSeen(id) {
  try {
    localStorage.setItem(WHATSNEW_LAST_SEEN_KEY, id);
  } catch { /* storage disabled — no-op */ }
}
