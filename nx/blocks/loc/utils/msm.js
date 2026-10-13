import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { daFetch } from '../../../../nx2/utils/api.js';

const sourceOf = (row) => row.base || row.source;
const linkedOf = (row) => row.satellite || row.linked;

const msmRowsCache = {};

/**
 * Load the org's MSM sheet rows, memoized per org. A 404 (no MSM) is cached as empty;
 * other failures are not cached so a later call retries.
 * @param {string} org - Org name.
 * @returns {Promise<{rows: object[]}|{error: string, status?: number}>} Rows, or an error.
 */
export function fetchMsmRows(org) {
  msmRowsCache[org] ??= (async () => {
    try {
      const resp = await daFetch({ url: `${DA_ADMIN}/config/${org}/` });
      if (resp.status === 404) return { rows: [] };
      if (!resp.ok) {
        delete msmRowsCache[org];
        return { error: 'Error fetching MSM config', status: resp.status };
      }
      const json = await resp.json();
      return { rows: json?.msm?.data || [] };
    } catch (e) {
      delete msmRowsCache[org];
      return { error: e.message };
    }
  })();
  return msmRowsCache[org];
}

/**
 * Build the ordered list of MSM source sites a site inherits from, nearest first.
 * @param {object} params
 * @param {object[]} params.rows - MSM sheet rows.
 * @param {string} params.site - Site to start from.
 * @returns {string[]} Ancestor site names; cycles stop at the first repeated site.
 */
export function getSourceChain({ rows, site }) {
  const chain = [];
  const visited = new Set();
  let current = site;
  while (current && !visited.has(current)) {
    visited.add(current);
    const linkedSite = current;
    const parentRow = rows.find((row) => linkedOf(row) === linkedSite);
    const parent = parentRow && sourceOf(parentRow);
    if (!parent || visited.has(parent)) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/**
 * Read a source file from the site, falling back to its MSM source sites on a 404.
 * @param {object} params
 * @param {string} params.org - Org name.
 * @param {string} params.site - Project site.
 * @param {string} params.daPath - DA path, including any snapshot prefix.
 * @param {object} [params.opts] - Fetch options forwarded to each request.
 * @returns {Promise<{resp: Response, resolvedSite: string, inherited: boolean,
 *   msmError?: {error: string, status?: number}}>} The response and the site it came from.
 */
export async function fetchWithMsmFallback({ org, site, daPath, opts }) {
  const fetchFrom = (fromSite) => daFetch({
    url: `${DA_ADMIN}/source/${org}/${fromSite}${daPath}`,
    opts,
  });

  const selfResp = await fetchFrom(site);
  if (selfResp.ok) return { resp: selfResp, resolvedSite: site, inherited: false };

  if (selfResp.status !== 404) return { resp: selfResp, resolvedSite: site, inherited: false };

  const { rows, error, status } = await fetchMsmRows(org);
  if (error) {
    return { resp: selfResp, resolvedSite: site, inherited: false, msmError: { error, status } };
  }
  if (!rows.length) return { resp: selfResp, resolvedSite: site, inherited: false };

  // daPath keeps any /.snapshots/ prefix on ancestors, so snapshots don't inherit.
  const chain = getSourceChain({ rows, site });
  for (const ancestor of chain) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetchFrom(ancestor);
    if (resp.ok) return { resp, resolvedSite: ancestor, inherited: true };
    if (resp.status !== 404) return { resp, resolvedSite: site, inherited: false };
  }

  return { resp: selfResp, resolvedSite: site, inherited: false };
}
