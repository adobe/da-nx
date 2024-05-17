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

      const fetched = fetch(`${url.href}.plain.html`);

      const timedout = setTimeout(() => {
        resolve('timedout');
      }, 20000);

      fetched.then(async (resp) => {
        url.status = resp.status;

        if (url.status === 200) {
          const text = await resp.text();
          const { daHref, daStatus } = await saveToDa(text, url);
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
