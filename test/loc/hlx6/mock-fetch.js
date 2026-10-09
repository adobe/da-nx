import { HLX_ADMIN, AEM_API, DA_ADMIN } from '../../../nx2/utils/utils.js';

export { AEM_API, DA_ADMIN };

export const calls = [];

const hlx6Sites = new Set();

let origFetch;
let counter = 0;

export function makeSite({ hlx6 = false } = {}) {
  counter += 1;
  const id = `${counter}-${Math.floor(Math.random() * 1e6)}`;
  const org = `locorg-${id}`;
  const site = `locsite-${id}`;
  if (hlx6) hlx6Sites.add(`/${org}/${site}`);
  return { org, site };
}

export function installFetch(respond = () => new Response('{}', { status: 200 })) {
  calls.length = 0;
  origFetch = window.fetch;
  const passthrough = origFetch;
  window.fetch = async (url, opts = {}) => {
    const href = url.toString();
    if (href.startsWith(window.location.origin)) return passthrough(url, opts);
    if (href.startsWith(`${HLX_ADMIN}/ping/`)) {
      const upgraded = hlx6Sites.has(href.slice(`${HLX_ADMIN}/ping`.length));
      return new Response('', { status: 200, headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {} });
    }
    const call = {
      url: href,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      signal: opts.signal,
    };
    calls.push(call);
    return respond(call);
  };
}

export function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = undefined;
}

export async function waitFor(predicate, timeout = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
}
