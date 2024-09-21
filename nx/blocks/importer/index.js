import { saveToDa } from '../../utils/daFetch.js';
import { mdToDocDom, docDomToAemHtml } from '../../utils/converters.js';

export default async function importUrl(url) {
  return new Promise((resolve) => {
    (() => {
      const [repo, org] = url.hostname.split('.')[0].split('--').slice(1).slice(-2);
      if (!(repo || org)) {
        url.status = '403';
        resolve('not aem');
        return;
      }
      url.originRepo = repo;
      url.originOrg = org;

      const href = url.href.endsWith('/') ? `${url.href}index` : url.href;
      const pathname = url.pathname.endsWith('/') ? `${url.pathname}index` : url.pathname;
      const saveUrl = { ...url, pathname };

      const fetched = fetch(`${href}.md`);
      const timedout = setTimeout(() => { resolve('timedout'); }, 20000);

      fetched.then(async (resp) => {
        url.status = resp.status;

        if (url.status === 200) {
          const md = await resp.text();
          const dom = mdToDocDom(md);
          const aemHtml = docDomToAemHtml(dom);
          const { daHref, daStatus } = await saveToDa(aemHtml, saveUrl);
          url.daHref = daHref;
          url.daStatus = daStatus;
        }
        clearTimeout(timedout);
        resolve('ontime');
      }).catch(() => {
        clearTimeout(timedout);
        url.status = 'error';
        resolve('error');
      });
    })();
  });
}
