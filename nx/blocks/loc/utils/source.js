import {
  daFetch, source, versions, isHlx6, fromPath,
} from '../../../../nx2/utils/api.js';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { createConfigLoader } from '../../../public/loc/copy.js';

// api.aem.live allows 10 requests per second per project, and its 429 carries no
// CORS headers, so the browser only sees a network error.
const HLX6_MAX_IN_FLIGHT = 4;
const HLX6_MIN_START_INTERVAL_MS = 125;
const HLX6_RETRY_DELAYS_MS = [5000, 20000, 60000];
const MAX_RETRY_AFTER_MS = 60000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export function createLimiter({
  maxInFlight, minIntervalMs, wait = sleep, now = Date.now,
}) {
  let active = 0;
  let nextStart = 0;
  let pausedUntil = 0;
  const waiting = [];

  const acquire = async () => {
    if (active < maxInFlight) {
      active += 1;
    } else {
      await new Promise((resolve) => { waiting.push(resolve); });
    }
    const start = Math.max(now(), nextStart, pausedUntil);
    nextStart = start + minIntervalMs;
    if (start > now()) await wait(start - now());
    while (pausedUntil > now()) {
      // eslint-disable-next-line no-await-in-loop
      await wait(pausedUntil - now());
    }
  };

  const release = () => {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      active -= 1;
    }
  };

  const limit = async (task) => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };

  limit.pause = (ms) => { pausedUntil = Math.max(pausedUntil, now() + ms); };

  return limit;
}

const isRetryable = (result) => result?.status === 429 || result?.status === 503;

function getRetryDelay({ result, attempt, delays }) {
  const header = result?.headers?.get?.('x-retry-after') || result?.headers?.get?.('retry-after');
  const seconds = Number(header);
  if (seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  return delays[attempt];
}

export async function withRetry(task, { limiter, delays = HLX6_RETRY_DELAYS_MS, attempt = 0 }) {
  let result;
  let error;
  try {
    result = await limiter(task);
  } catch (e) {
    error = e;
  }
  if (!error && !isRetryable(result)) return result;
  if (attempt >= delays.length) {
    if (error) throw error;
    return result;
  }
  limiter.pause(getRetryDelay({ result, attempt, delays }));
  return withRetry(task, { limiter, delays, attempt: attempt + 1 });
}

const limiters = {};

async function run({ org, site }, task, { retry = true } = {}) {
  const hlx6 = await isHlx6(org, site);
  if (!hlx6) return task(hlx6);
  const key = `/${org}/${site}`;
  limiters[key] ??= createLimiter({
    maxInFlight: HLX6_MAX_IN_FLIGHT,
    minIntervalMs: HLX6_MIN_START_INTERVAL_MS,
  });
  const paced = () => task(hlx6);
  return retry ? withRetry(paced, { limiter: limiters[key] }) : limiters[key](paced);
}

export function getSource(path, { noCache, signal } = {}) {
  const args = fromPath(path);
  return run(args, (hlx6) => {
    const opts = {};
    if (signal) opts.signal = signal;
    // api.aem.live does not allow cache-control in CORS and answers no-store anyway.
    if (noCache && !hlx6) opts.headers = { 'Cache-Control': 'no-cache' };
    return source.get({ ...args, opts: Object.keys(opts).length ? opts : undefined });
  });
}

export function saveSource(path, body) {
  const args = fromPath(path);
  return run(args, () => source.save({ ...args, body }));
}

export function listSource(path, { signal } = {}) {
  const args = fromPath(path);
  return run(args, () => source.list({ ...args, opts: signal ? { signal } : undefined }));
}

export function moveSource(path, destination) {
  const args = fromPath(path);
  return run(args, () => source.move({ ...args, destination }), { retry: false });
}

export function createVersion(path, label) {
  const args = fromPath(path);
  return run(args, () => versions.create({ ...args, comment: label }));
}

const DA_ROUTES = ['source', 'versionsource'].map((kind) => ({ kind, prefix: `${DA_ADMIN}/${kind}` }));

// The public copy engine builds DA admin URLs; on Helix 6 they go to the source bus instead.
export async function sourceFetch(href, opts = {}) {
  const route = DA_ROUTES.find(({ prefix }) => href.startsWith(`${prefix}/`));
  if (!route) return daFetch({ url: href, opts });
  const path = href.slice(route.prefix.length);
  const { org, site } = fromPath(path);
  if (!(await isHlx6(org, site))) return daFetch({ url: href, opts });
  if (route.kind === 'versionsource') {
    const { label } = opts.body ? JSON.parse(opts.body) : {};
    return createVersion(path, label);
  }
  if (!opts.method || opts.method === 'GET') return getSource(path, { signal: opts.signal });
  const body = opts.body instanceof FormData ? opts.body.get('data') : opts.body;
  return saveSource(path, body);
}

const loadLegacyConfig = createConfigLoader({
  fetch: (url, opts) => daFetch({ url, opts }),
  daOrigin: DA_ADMIN,
});

const hlx6Configs = {};

async function loadHlx6Config({ org, site }) {
  const resp = await getSource(`/${org}/${site}/.da/translate.json`);
  if (resp.ok) return resp.json();
  if (resp.status === 404) return { config: { data: [] } };
  throw Object.assign(new Error(`Reading translation config failed (${resp.status})`), { status: resp.status });
}

// Helix 6 has no org-level source, so only the site's translate.json counts.
export async function loadCopyConfig({ org, site }) {
  if (!(await isHlx6(org, site))) return loadLegacyConfig({ org, site });
  const key = `/${org}/${site}`;
  hlx6Configs[key] ??= loadHlx6Config({ org, site }).catch((error) => {
    delete hlx6Configs[key];
    throw error;
  });
  return hlx6Configs[key];
}
