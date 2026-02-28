import { BASE_OPTS, corsFetch } from './utils.js';

const TOKEN_BUFFER = 300000; // 5 min buffer before expiry

// --- localStorage helpers ---

function tokenKey(name, env) {
  return `${name.toLowerCase()}.${env}.token`;
}

function getTokenDetails(name, env) {
  const stored = localStorage.getItem(tokenKey(name, env));
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return {};
    }
  }
  return {};
}

function setTokenDetails(name, env, accessToken, expires) {
  localStorage.setItem(tokenKey(name, env), JSON.stringify({ accessToken, expires }));
}

// --- Exports ---

// Returns cached token or fetches new one via Auth0 client credentials flow
export async function getAccessToken(service) {
  const {
    name,
    env = 'prod',
    clientId,
    clientSecret,
    authEndpoint,
    audience,
  } = service;

  // Return cached token if still valid
  const { accessToken: cached, expires: cachedExpires } = getTokenDetails(name, env);
  if (cached && cachedExpires > Date.now()) return cached;

  const body = JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    audience,
  });

  const opts = { ...BASE_OPTS, body };
  const resp = await corsFetch(authEndpoint, opts);
  if (!resp.ok) return null;

  const json = await resp.json();
  const { access_token: accessToken, expires_in: expiresIn } = json;
  if (!accessToken) return null;

  const expires = Date.now() + (expiresIn * 1000) - TOKEN_BUFFER;
  setTokenDetails(name, env, accessToken, expires);

  return accessToken;
}

// Ensures we have a valid token, returns true/false
export default async function authReady(service) {
  const accessToken = await getAccessToken(service);
  return !!accessToken;
}
