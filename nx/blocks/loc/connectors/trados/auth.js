import { daFetch } from '../../../../utils/daFetch.js';

const LOGIN_ORIGIN = 'https://da-etc.adobeaem.workers.dev';
const TOKEN_BUFFER = 300000; // 5 min buffer before expiry

function tokenKey(org, site, env) {
  return `trados.${org}.${site}.${env}.token`;
}

function getTokenDetails(org, site, env) {
  const stored = localStorage.getItem(tokenKey(org, site, env));
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function setTokenDetails(org, site, env, accessToken, expires) {
  localStorage.setItem(
    tokenKey(org, site, env),
    JSON.stringify({ accessToken, expires }),
  );
}

export async function getAccessToken(service) {
  const { org, site, env = 'prod' } = service;

  const { accessToken: cached, expires: cachedExpires } = getTokenDetails(org, site, env);
  if (cached && cachedExpires > Date.now()) return cached;

  const opts = { method: 'POST' };

  const resp = await daFetch(`${LOGIN_ORIGIN}/${org}/sites/${site}/integrations/trados/login`, opts);
  if (!resp.ok) return null;

  const { access_token: accessToken, expires_in: expiresIn } = await resp.json();
  if (!accessToken) return null;

  const expires = Date.now() + (expiresIn * 1000) - TOKEN_BUFFER;
  setTokenDetails(org, site, env, accessToken, expires);

  return accessToken;
}

export default async function authReady(service) {
  const accessToken = await getAccessToken(service);
  return !!accessToken;
}
