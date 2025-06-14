import { Queue } from '../../../../public/utils/tree.js';

const results = {};

async function sendForTranslation(basePath, sourceHtml, toLang) {
  const body = new FormData();
  body.append('data', sourceHtml);
  body.append('fromlang', 'en');
  body.append('tolang', toLang);

  const opts = { method: 'POST', body };

  const resp = await fetch('https://translate.da.live/google', opts);
  if (!resp.ok) {
    console.log(resp.status);
    return null;
  }
  const { translated } = await resp.json();
  if (translated) {
    const blob = new Blob([translated], { type: 'text/html' });
    return { basePath, blob };
  }
  return null;
}

import { addDnt } from './dnt.js';

export const dnt = { addDnt };

export async function isConnected() {
  return true;
}

export async function sendAllLanguages({ langs, urls, actions }) {
  const translateUrl = (url) => {
    console.log(url);
    url.test = 'testing';
  };

  for (const lang of langs) {
    const queue = new Queue(translateUrl, 50);
    const langUrls = urls.map((url) => {
      return url;
    });

    await Promise.all(langUrls.map((url) => queue.push(url)));

    console.log(langUrls);
  }

  // await Promise.all(langs.map(async (lang) => {
  //   lang.translation.sent = urls.length;

  //   const urlResults = await Promise.all(
  //     urls.map(async (url) => sendForTranslation(url.basePath, url.content, lang.code)),
  //   );

  //   const success = urlResults.filter((result) => result).length;
  //   lang.translation.translated = success;
  //   if (success === urls.length) {
  //     lang.translation.translated = urls.length;
  //     lang.translation.status = 'created';
  //     results[lang.code] = urlResults;
  //   }
  // }));
}

export async function getStatusAll({ title, service, langs, urls, actions }) {
  // not needed
}

export async function saveItems({
  org,
  site,
  service,
  lang,
  urls,
  saveToDa,
}) {
  return results[lang.code];
}

export async function cancelTranslation({ service, lang, sendMessage }) {

}
