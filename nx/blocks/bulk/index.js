import { daFetch } from '../../utils/daFetch.js';

export function throttle(start) {
  const end = Date.now();
  const timeDiff = end - start;
  const pause = timeDiff > 2000 ? 0 : 500 + timeDiff;
  return new Promise((resolve) => { setTimeout(() => { resolve(); }, pause); });
}

export function formatUrls(urls, action) {
  return [...new Set(urls.split('\n'))].reduce((acc, href) => {
    try {
      const url = new URL(href);
      const [ref, repo, org] = url.hostname.split('.').shift().split('--');
      let { pathname } = url;
      if (pathname.endsWith('/')) pathname = `${pathname}index`;
      if (ref && org && repo && pathname) {
        acc.push({
          href, ref, org, repo, pathname, action,
        });
      }
    } catch {
      console.log('Could not make url.');
    }
    return acc;
  }, []);
}

export async function sendAction(url) {
  try {
    const opts = { method: 'POST' };
    const aemUrl = `https://admin.hlx.page/${url.action}/${url.org}/${url.repo}/${url.ref}${url.pathname}`;
    const resp = await daFetch(aemUrl, opts);
    url.status = resp.status;
  } catch {
    url.status = '400';
  }
  return url;
}
