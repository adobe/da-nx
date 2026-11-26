import { getExt } from '../../../nx2/public/utils/getExt.js';
import { daFetch, isHlx6, AEM_API } from '../../../nx2/utils/api.js';
import { DA_ORIGIN } from '../../../nx2/public/utils/constants.js';
import { HLX_ADMIN } from '../../../nx2/utils/utils.js';

function isBulkDa(action) {
  return action === 'versionsource';
}

export function formatUrls(urls, action, hasDelete) {
  return [...new Set(urls.split('\n'))].reduce((acc, href) => {
    try {
      const url = new URL(href);
      const [ref, repo, org] = url.hostname.split('.').shift().split('--');
      let { pathname } = url;
      if (pathname.endsWith('/')) pathname = `${pathname}index`;
      if (ref && org && repo && pathname) {
        acc.push({
          href, ref, org, repo, pathname, action, hasDelete,
        });
      }
    } catch {
      // eslint-disable-next-line no-console
      console.log('Could not make url.');
    }
    return acc;
  }, []);
}

export async function sendAction(url, label) {
  const {
    action, org, repo, ref, pathname, hasDelete, href,
  } = url;
  let resp;
  try {
    const method = hasDelete ? 'DELETE' : 'POST';
    const opts = { method };
    const isDa = isBulkDa(action);
    if (label && isDa) opts.body = JSON.stringify({ label });
    const hlx6 = (action === 'preview' || action === 'live')
      && await isHlx6(org, repo).catch(() => false);
    const path = isDa && !getExt(pathname) ? `${pathname}.html` : pathname;
    const legacyHref = isDa ? `${DA_ORIGIN}/${action}/${org}/${repo}${path}` : `${HLX_ADMIN}/${action}/${org}/${repo}/${ref}${path}`;
    const apiHref = hlx6 ? `${AEM_API}/${org}/sites/${repo}/${action}${path}` : legacyHref;
    resp = await daFetch({ url: apiHref, opts });
  } catch {
    // eslint-disable-next-line no-console
    console.log(`Error sending ${action} for ${href}`);
  }
  url.ok = resp?.ok ?? false;
  url.status = resp?.status ?? 0;
  return url;
}
