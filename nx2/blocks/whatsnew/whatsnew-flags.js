// Tracks the published-date of the what's-new content the user last saw, so
// the dialog can auto-open only when there's something newer than that. Not
// EW-specific (see ewFlags.js) — the what's-new nav item can be authored
// onto any page. ISO date strings (e.g. "2026-09-10") compare correctly with
// plain string comparison, no date parsing needed.
const WHATSNEW_LAST_SEEN_KEY = 'nx2:whatsnew-last-seen-date';

export function getWhatsNewLastSeenDate() {
  try {
    return localStorage.getItem(WHATSNEW_LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function setWhatsNewLastSeenDate(date) {
  try {
    localStorage.setItem(WHATSNEW_LAST_SEEN_KEY, date);
  } catch { /* storage disabled — no-op */ }
}
