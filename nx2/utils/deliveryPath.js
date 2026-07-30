import { fetchDaConfigs } from './daConfig.js';

/**
 * Rows from the config tab explicitly named `data`. A single-sheet config has
 * one (unnamed) tab whose rows sit at `json.data`; a multi-sheet config exposes
 * the `data` tab at `json.data.data`. Relying on the tab name — rather than the
 * first tab — keeps resolution stable if other tabs are added.
 * @param {Record<string, any>} json
 * @returns {Array<{ key?: string, value?: string }>}
 */
function getDataSheet(json) {
  if (json?.[':type'] === 'multi-sheet') return json.data?.data ?? [];
  return json?.data ?? [];
}

/**
 * Fills a delivery-URL template by substituting `${aemPath}` and collapsing any
 * accidental duplicate slashes the substitution introduces.
 * @param {string} template  URL template, may contain `${aemPath}`.
 * @param {string} aemPath   Lowercased `/org/site/path` (carries a leading slash).
 * @returns {string}
 */
export function applyUrlTemplate(template, aemPath) {
  // eslint-disable-next-line no-template-curly-in-string
  const url = template.replace('${aemPath}', aemPath);
  // aemPath carries a leading slash, so a template like `.../preview/${aemPath}`
  // yields `preview//...`; collapse duplicate slashes but keep the `://` scheme.
  return url.replace(/([^:])\/{2,}/g, '$1/');
}

/**
 * Resolves a customer-configured override for the tab URL opened after a
 * preview/publish, mirroring da.live's `editor.path` mechanism.
 *
 * Customers add `preview.path` (preview) / `live.path` (publish) rows to the DA
 * config `data` tab, each valued `PATH=URL_TEMPLATE` (split on the first `=`, so
 * the template may carry a query string). PATH is prefix-matched against
 * `aemPath` (longest match wins; site config beats org on ties) and
 * URL_TEMPLATE may contain `${aemPath}`.
 *
 * @param {{ org: string, site: string, action: 'preview' | 'publish', aemPath: string }} params
 * @returns {Promise<string | null>} The resolved URL, or null when nothing matches.
 */
export async function getConfiguredDeliveryUrl({ org, site, action, aemPath }) {
  const key = action === 'publish' ? 'live.path' : 'preview.path';
  // Best-effort: an override is optional, so any failure resolving it must fall
  // back to the caller's default rather than block opening the delivered page.
  try {
    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    // Reverse so site config precedes org config; the stable sort below then
    // lets a site-level row win an equal-length prefix tie (site overrides org).
    const rows = configs.filter(Boolean).reverse().flatMap((c) => getDataSheet(c));

    const matched = rows
      .filter((row) => row.key === key && typeof row.value === 'string')
      .map((row) => {
        const eq = row.value.indexOf('='); // first `=` only — URLs contain `=`
        return { eq, prefix: row.value.slice(0, eq), template: row.value.slice(eq + 1) };
      })
      .filter(({ eq, prefix }) => eq > 0 && aemPath.startsWith(prefix));

    if (!matched.length) return null;

    const best = matched.sort((a, b) => b.prefix.length - a.prefix.length)[0];
    return applyUrlTemplate(best.template, aemPath);
  } catch {
    return null;
  }
}
