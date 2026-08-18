import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { daFetch } from '../../../../nx2/utils/api.js';

const sourceOf = (row) => row.base || row.source;
const linkedOf = (row) => row.satellite || row.linked;

const msmRowsCache = {};

export function fetchMsmRows(org) {
  msmRowsCache[org] ??= (async () => {
    try {
      const resp = await daFetch({ url: `${DA_ADMIN}/config/${org}/` });
      if (resp.status === 404) return [];
      if (!resp.ok) throw new Error(`config ${resp.status}`);
      const json = await resp.json();
      return json?.msm?.data || [];
    } catch {
      delete msmRowsCache[org];
      return [];
    }
  })();
  return msmRowsCache[org];
}

export function getSourceChain(rows, site) {
  const chain = [];
  const visited = new Set();
  let current = site;
  while (current && !visited.has(current)) {
    visited.add(current);
    const linkedSite = current;
    const parentRow = rows.find((row) => linkedOf(row) === linkedSite);
    const parent = parentRow && sourceOf(parentRow);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

export async function fetchWithMsmFallback({ org, site, daPath, opts }) {
  const fetchFrom = (fromSite) => daFetch({
    url: `${DA_ADMIN}/source/${org}/${fromSite}${daPath}`,
    opts,
  });

  const selfResp = await fetchFrom(site);
  if (selfResp.ok) return { resp: selfResp, resolvedSite: site, inherited: false };

  if (selfResp.status !== 404) return { resp: selfResp, resolvedSite: site, inherited: false };

  const rows = await fetchMsmRows(org);
  if (!rows.length) return { resp: selfResp, resolvedSite: site, inherited: false };

  const chain = getSourceChain(rows, site);
  for (const ancestor of chain) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetchFrom(ancestor);
    if (resp.ok) return { resp, resolvedSite: ancestor, inherited: true };
  }

  return { resp: selfResp, resolvedSite: site, inherited: false };
}
