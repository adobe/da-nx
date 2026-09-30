import { isValidEndpointName } from './endpoint.js';

export const ENDPOINTS_SECTION = 'endpoints';

// #/{org}/{site}/endpoints/{endpoint}; anything else within a site opens the list.
export function toRoute(details) {
  if (!details?.org) return undefined;
  const { org, site, path } = details;
  if (!site) return { org };
  const [section, ...rest] = (path || '').split('/').filter(Boolean);
  if (section !== ENDPOINTS_SECTION || !rest.length) return { org, site };
  const endpoint = rest.join('/');
  return isValidEndpointName(endpoint) ? { org, site, endpoint } : { org, site };
}

export function buildHash({ org, site, endpoint } = {}) {
  if (!org) return '';
  if (!site) return `#/${org}`;
  return `#/${[org, site, ENDPOINTS_SECTION, endpoint].filter(Boolean).join('/')}`;
}

const ROUTE_KEYS = ['org', 'site', 'endpoint'];

export const isSameRoute = ({ route, other }) => ROUTE_KEYS
  .every((key) => route?.[key] === other?.[key]);
