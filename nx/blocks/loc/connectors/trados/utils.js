export const BASE_OPTS = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
};

const PROXY_URL = 'https://da-etc.adobeaem.workers.dev/cors?url=';

export function corsFetch(url, opts) {
  const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
  return fetch(proxyUrl, opts);
}
