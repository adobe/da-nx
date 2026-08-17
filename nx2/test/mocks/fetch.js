import { HLX_ADMIN } from '../../utils/utils.js';

// Shared `window.fetch` mock for tests that exercise `nx2/utils/api.js`,
// directly or transitively (daConfig.js, ewFlags.js, org-check.js, ...).
//
// `api.js`'s `isHlx6` probes `${HLX_ADMIN}/ping/{org}/{site}` before most
// requests; every caller of this mock needs that request handled the same
// way, so it is built in here rather than repeated per test file.
//
// Usage:
//   let fetchCtl;
//   afterEach(() => fetchCtl?.restore());
//   ...
//   fetchCtl = installFetch({
//     pingHlx6: true,             // make isHlx6() resolve true
//     routes: [
//       { match: '/org/site/', body: JSON.stringify({ foo: 'bar' }) },
//       { match: (url) => url.endsWith('/x'), status: 404 },
//     ],
//     fallback: { body: '{}' },   // used when no route matches (default: 200 '{}')
//   });
//   ... assertions against fetchCtl.calls / fetchCtl.lastCall() ...
//   fetchCtl.restore();
//
// `match` may be a substring (checked via `url.includes(match)`) or a
// predicate `(url) => boolean`. Routes are checked in order; first match wins.
export function installFetch({
  pingHlx6 = false,
  routes = [],
  fallback = { body: '{}', status: 200, headers: {} },
} = {}) {
  const calls = [];
  const origFetch = window.fetch;

  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({
      url: u,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
    });

    if (u.includes(`${HLX_ADMIN}/ping/`)) {
      const headers = pingHlx6 ? { 'x-api-upgrade-available': 'true' } : {};
      return new Response('', { status: 200, headers });
    }

    const route = routes.find(({ match }) => (
      typeof match === 'function' ? match(u) : u.includes(match)
    ));
    const { body = '{}', status = 200, headers = {} } = route ?? fallback;
    return new Response(body, { status, headers });
  };

  return {
    calls,
    lastCall: () => calls[calls.length - 1],
    restore: () => { window.fetch = origFetch; },
  };
}
