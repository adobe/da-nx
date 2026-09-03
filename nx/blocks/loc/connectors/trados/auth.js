import { loginViaDaEtc, getCachedToken, setCachedToken } from '../../utils/auth.js';

const TOKEN_BUFFER = 300000; // 5 min buffer before expiry

export async function getAccessToken(service) {
  const { org, site, env = 'prod' } = service;

  const { accessToken: cached, expires: cachedExpires } = getCachedToken('trados', org, site, env);
  if (cached && cachedExpires > Date.now()) return cached;

  const data = await loginViaDaEtc('trados', org, site, env);
  const { access_token: accessToken, expires_in: expiresIn } = data || {};
  if (!accessToken) return null;

  const expires = Date.now() + (expiresIn * 1000) - TOKEN_BUFFER;
  setCachedToken('trados', org, site, env, { accessToken, expires });

  return accessToken;
}

export default async function authReady(service) {
  const accessToken = await getAccessToken(service);
  return !!accessToken;
}
