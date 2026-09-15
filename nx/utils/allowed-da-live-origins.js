// Allowed origins for the da-live host frame that embeds quick-edit / the quick-edit portal.
// Mirrors da-live's own scripts/dapreview.js allowlist, which checks the same relationship
// from the other side (da-live verifying a message came from its own preview iframe).
const ALLOWED_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+--da-live--adobe\.aem\.(page|live)$/;

export function isAllowedDaLiveOrigin(origin) {
  return origin === 'https://da.live'
    || origin === 'http://localhost:3000'
    || origin === 'https://localhost'
    || ALLOWED_ORIGIN_PATTERN.test(origin);
}
