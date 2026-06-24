import { source } from '../../../../nx2/utils/api.js';

/**
 * Wrap localized content in a DA-compatible HTML document and rewrite
 * relative media / hrefs back to the source site's absolute origin.
 */
export function replaceHtml(text, fromOrg, fromRepo, options = {}) {
  const { daMetadata = {}, replaceRelative = true } = options;
  let inner = text;

  if (fromOrg && fromRepo && replaceRelative) {
    const fromOrigin = `https://main--${fromRepo}--${fromOrg}.aem.live`;
    inner = text
      .replaceAll('./media', `${fromOrigin}/media`)
      .replaceAll('href="/', `href="${fromOrigin}/`);
  }

  let metadataHTML = '';
  if (Object.keys(daMetadata).length > 0) {
    const daRows = Object.entries(daMetadata)
      .map(([key, value]) => `<div><div>${key}</div><div>${value}</div></div>`)
      .join('');
    metadataHTML = `\n  <div class="da-metadata">${daRows}</div>\n`;
  }

  return `
    <body>
      <header></header>
      <main>${inner}</main>
      ${metadataHTML}<footer></footer>
    </body>
  `;
}

/**
 * Save localized HTML to DA. Routes through the Helix-6-aware `source.save`,
 * so upgraded sites write to AEM and legacy sites write to DA admin.
 *
 * @param {string} text - The raw inner content.
 * @param {{org: string, repo: string, pathname: string}} url - Target location.
 * @param {Object} [options] - Passed to `replaceHtml` (daMetadata, replaceRelative).
 */
export async function saveToDa(text, url, options = {}) {
  const { org, repo, pathname } = url;
  const daPath = `/${org}/${repo}${pathname}`;
  const daHref = `https://da.live/edit#${daPath}`;

  const body = replaceHtml(text, org, repo, options);

  try {
    const daResp = await source.save({ org, site: repo, path: `${pathname}.html`, body });
    return { daHref, daStatus: daResp.status, daResp, ok: daResp.ok };
  } catch {
    // eslint-disable-next-line no-console
    console.log(`Couldn't save ${daPath}`);
    return null;
  }
}
