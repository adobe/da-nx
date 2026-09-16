const ALLOWED_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+--da-live--adobe\.aem\.(page|live)$/;

export function isAllowedDaLiveOrigin(origin) {
  return origin === 'https://da.live'
    || origin === 'http://localhost:3000'
    || origin === 'https://localhost'
    || ALLOWED_ORIGIN_PATTERN.test(origin);
}
