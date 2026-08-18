// date-time helpers: store UTC (`…Z`), edit/display in the viewer's local zone.

// Native datetime-local value (local wall-clock) → UTC ISO string, '' if empty.
export function localToUtc(local) {
  if (!local) { return ''; }
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) { return ''; }
  // Round to the minute so pre-1900 sub-minute offsets (Local Mean Time) can't
  // leak seconds into the canonical `…:00Z` form.
  return new Date(Math.round(d.getTime() / 60000) * 60000).toISOString();
}

// UTC ISO instant → native datetime-local value in the viewer's local zone, ''
// if empty. Use local getters, never slice toISOString() (that's UTC).
export function utcToLocal(iso) {
  if (!iso) { return ''; }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) { return ''; }
  const pad = (n) => String(n).padStart(2, '0');
  // 4-digit year so the native input can parse it (getFullYear returns 1, not 0001).
  const year = String(d.getFullYear()).padStart(4, '0');
  return `${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
