import { saveToDa } from '../../utils/daFetch.js';

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
      const pathname = url.pathanme.endsWith('/') ? `${url.pathname}index` : url.pathname;
      const saveUrl = { ...url, pathname };

      const fetched = fetch(`${href}.plain.html`);

      const timedout = setTimeout(() => {
        resolve('timedout');
      }, 20000);

      fetched.then(async (resp) => {
        url.status = resp.status;

        if (url.status === 200) {
          const text = await resp.text();
          const { daHref, daStatus } = await saveToDa(text, saveUrl);
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
