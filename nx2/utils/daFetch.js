/*
 * Copyright 2026 Adobe. All rights reserved.
 * DA service origins and authenticated fetch for nx2.
 */
import { env } from '../scripts/nx.js';

export const AEM_ORIGIN = 'https://admin.hlx.page';

const DA_ADMIN_ENVS = {
  local: 'http://localhost:8787',
  stage: 'https://stage-admin.da.live',
  prod: 'https://admin.da.live',
};

const DA_COLLAB_ENVS = {
  local: 'ws://localhost:4711',
  stage: 'wss://stage-collab.da.live',
  prod: 'wss://collab.da.live',
};

const DA_CONTENT_ENVS = {
  local: 'http://localhost:8788',
  stage: 'https://stage-content.da.live',
  prod: 'https://content.da.live',
};

/**
 * @param {string} storageKey
 * @param {Record<string, string>} envs
 * @param {{ pageLiveToPage?: boolean }} [options]
 * @returns {string}
 */
function resolveDaServiceOrigin(storageKey, envs, options = {}) {
  try {
    const q = new URL(window.location.href).searchParams.get(storageKey);
    if (q === 'reset') {
      localStorage.removeItem(storageKey);
    } else if (q) {
      localStorage.setItem(storageKey, q);
    }
  } catch {
    /* ignore */
  }
  const stored = localStorage.getItem(storageKey);
  let resolved;
  if (stored && envs[stored]) {
    resolved = envs[stored];
  } else {
    const fallbackKey = env === 'prod' ? 'prod' : 'stage';
    resolved = envs[fallbackKey];
  }
  if (options.pageLiveToPage && typeof location !== 'undefined' && location.origin === 'https://da.page') {
    return resolved.replace('.live', '.page');
  }
  return resolved;
}

export const DA_ORIGIN = (() => resolveDaServiceOrigin('da-admin', DA_ADMIN_ENVS))();
export const COLLAB_ORIGIN = (() => resolveDaServiceOrigin('da-collab', DA_COLLAB_ENVS, { pageLiveToPage: true }))();
export const CON_ORIGIN = (() => resolveDaServiceOrigin('da-content', DA_CONTENT_ENVS))();

/** Origins that may receive a bearer token (align with da-live daFetch rules). */
const TOKEN_URL_PREFIXES = [
  'https://admin.da.live',
  'https://stage-admin.da.live',
  'http://localhost:8787',
  'https://content.da.live',
  'https://stage-content.da.live',
  'http://localhost:8788',
];

/**
 * @param {string} url
 * @returns {boolean}
 */
function shouldAttachToken(url) {
  try {
    const resolved = new URL(url, window.location.href).href;
    if (resolved.startsWith(AEM_ORIGIN)) return true;
    return TOKEN_URL_PREFIXES.some((prefix) => resolved.startsWith(prefix));
  } catch {
    return false;
  }
}

/**
 * Fetch with optional IMS bearer for DA admin / content / AEM URLs.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<Response>}
 */
export async function daFetch(url, opts = {}) {
  const nextOpts = {
    ...opts,
    headers: { ...(opts.headers || {}) },
  };

  if (shouldAttachToken(url)) {
    try {
      const { loadIms } = await import('./ims.js');
      const ims = await loadIms();
      const token = ims?.accessToken?.token;
      if (token) {
        nextOpts.headers.Authorization = `Bearer ${token}`;
        if (typeof url === 'string' && url.startsWith(AEM_ORIGIN)) {
          nextOpts.headers['x-content-source-authorization'] = `Bearer ${token}`;
        }
      }
    } catch {
      /* ignore */
    }
  }

  let resp;
  try {
    resp = await fetch(url, nextOpts);
  } catch (err) {
    resp = new Response(null, { status: 500, statusText: String(err?.message || err) });
  }

  if (resp.status === 401) {
    try {
      const resolved = new URL(url, window.location.href).href;
      // TEMP DIAGNOSTIC: SLICC-iframe IMS-loop investigation
      // eslint-disable-next-line no-console
      console.error('[daFetch] 401 → triggering IMS sign-in', {
        url: resolved,
        method: opts.method || 'GET',
        stack: new Error('daFetch 401 stack').stack,
      });
    } catch { /* ignore */ }
    try {
      const { loadIms, handleSignIn } = await import('./ims.js');
      await loadIms();
      handleSignIn();
    } catch {
      /* ignore */
    }
  }

  return resp;
}
