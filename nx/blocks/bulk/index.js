import { getExt } from '../../public/utils/getExt.js';
import { daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';

const AEM_ORIGIN = 'https://admin.hlx.page';

function isBulkDa(action) {
  return action === 'versionsource';
}

export function throttle(start) {
  const end = Date.now();
  const timeDiff = end - start;
  const pause = timeDiff > 2000 ? 0 : 500 + timeDiff;
  return new Promise((resolve) => { setTimeout(() => { resolve(); }, pause); });
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
      console.log('Could not make url.');
    }
    return acc;
  }, []);
}

export async function sendAction(url, label) {
  try {
    const method = url.hasDelete ? 'DELETE' : 'POST';
    const opts = { method };
    if (label && isBulkDa(url.action)) opts.body = JSON.stringify({ label });
    const origin = isBulkDa(url.action) ? DA_ORIGIN : AEM_ORIGIN;
    const ext = getExt(url.pathname);
    const path = !ext && isBulkDa(url.action) ? `${url.pathname}.html` : url.pathname;
    const ref = isBulkDa(url.action) ? '' : `/${url.ref}`;
    const aemUrl = `${origin}/${url.action}/${url.org}/${url.repo}${ref}${path}`;
    const resp = await daFetch(aemUrl, opts);
    url.status = resp.status;
  } catch {
    url.status = '400';
  }
  return url;
}
