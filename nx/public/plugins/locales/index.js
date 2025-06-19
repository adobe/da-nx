import { DA_ORIGIN, AEM_ORIGIN } from '../../utils/constants.js';
import { Queue } from '../../utils/tree.js';

const LANG_CONF = '/.da/translate-v2.json';

export const [setContext, getContext] = (() => {
  let ctx;
  return [
    (supplied) => {
      ctx = (() => {
        const { org, repo: site, path, token } = supplied;
        return { org, site, path, token };
      })();
      return ctx;
    },
    () => ctx,
  ];
})();

export async function getLangsAndLocales() {
  const { org, site, token } = getContext();
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const resp = await fetch(`${DA_ORIGIN}/source/${org}/${site}${LANG_CONF}`, opts);
  if (!resp.ok) return { message: { text: 'There was an error fetching languages.', type: 'error' } };
  const sheet = await resp.json();
  const { data: langData } = sheet.languages;
  const { data: localeData } = sheet.locales;

  const langs = langData.map((row) => ({ name: row.name, location: row.location }));

  const locales = localeData.map((row) => {
    const localeLangs = langs.map((lang) => ({
      name: lang.name,
      globalLocation: lang.location,
      location: `${lang.location}-${row.location.replace('/', '')}`,
    }));
    return {
      ...row,
      langs: localeLangs,
    };
  });

  return { langs, locales };
}

export async function getPage(fullpath) {
  const { token } = getContext();
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const resp = await fetch(`${DA_ORIGIN}/source${fullpath}.html`, opts);
  return resp.status === 200;
}

export async function copyPage(sourcePath, destPath) {
  const { token } = getContext();
  const body = new FormData();
  body.append('destination', `${destPath}.html`);
  const opts = { method: 'POST', body, headers: { Authorization: `Bearer ${token}` } };
  await fetch(`${DA_ORIGIN}/copy${sourcePath}.html`, opts);
}

export async function publishPages(pages) {
  const { org, site, token } = getContext();
  const opts = { method: 'POST', headers: { Authorization: `Bearer ${token}` } };

  const publish = async (url) => {
    let resp = await fetch(`${AEM_ORIGIN}/preview/${org}/${site}/main${url.path}`, opts);
    if (resp.status === 200) {
      resp = await fetch(`${AEM_ORIGIN}/live/${org}/${site}/main${url.path}`, opts);
    }
    url.status = resp.status;
  };

  const queue = new Queue(publish, 5);

  return new Promise((resolve) => {
    const throttle = setInterval(() => {
      const nextUrl = pages.find((url) => !url.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else {
        console.log('out');
        console.log(pages);
        const finished = pages.every((url) => url.status);
        if (finished) {
          clearInterval(throttle);
          resolve(pages);
        }
      }
    }, 250);
  });
}
