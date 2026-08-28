import { HLX_ADMIN } from '../../utils/utils.js';

// Shared `window.fetch` mock for tests that exercise `nx2/utils/api.js`,
// directly or transitively (daConfig.js, ewFlags.js, org-check.js, ...).
// Extracted from test/nx2/utils/api.test.js so other test files reuse the
// same helper instead of hand-rolling their own.
//
// `installFetch` covers the common case: one response (status/body/headers)
// for every non-ping request. `isHlx6`'s `HLX_ADMIN/ping/...` probe is
// handled automatically (`pingHlx6` controls whether it looks upgraded).
//
// For tests that need different responses per URL (e.g. org vs site config,
// or DA-legacy vs hlx6 source-bus endpoints), assign `window.fetch` directly
// after calling `restoreFetch()`, pushing entries into the exported `calls`
// array yourself — see api.test.js's `source.list org-level ...` tests for
// the pattern.
export const calls = [];
let origFetch;

export function installFetch({
  pingHlx6 = false, headers = {}, status: httpStatus = 200, body = '{}',
} = {}) {
  calls.length = 0;
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({ url: u, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    if (u.includes(`${HLX_ADMIN}/ping/`)) {
      const respHeaders = pingHlx6 ? { 'x-api-upgrade-available': 'true' } : {};
      return new Response('', { status: 200, headers: respHeaders });
    }
    return new Response(body, { status: httpStatus, headers });
  };
}

export function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

export function lastCall() {
  return calls[calls.length - 1];
}

export function callsTo(origin) {
  return calls.filter((c) => c.url.startsWith(origin));
}
