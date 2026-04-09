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
 * @returns {string}
 */
function resolveDaServiceOrigin(storageKey, envs) {
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
  if (stored && envs[stored]) return envs[stored];
  const fallbackKey = env === 'prod' ? 'prod' : 'stage';
  return envs[fallbackKey];
}

export const DA_ORIGIN = (() => resolveDaServiceOrigin('da-admin', DA_ADMIN_ENVS))();
export const COLLAB_ORIGIN = (() => resolveDaServiceOrigin('da-collab', DA_COLLAB_ENVS))();
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
      const { loadIms, handleSignIn } = await import('./ims.js');
      await loadIms();
      handleSignIn();
    } catch {
      /* ignore */
    }
  }

  return resp;
}
