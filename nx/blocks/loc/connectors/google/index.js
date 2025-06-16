import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { Queue } from '../../../../public/utils/tree.js';
import { convertPath } from '../../utils/utils.js';

const results = {};

async function sendForTranslation(org, site, url) {
  const body = new FormData();
  body.append('data', url.content);
  body.append('fromlang', 'en');
  body.append('tolang', url.code);

  const opts = { method: 'POST', body };

  const resp = await fetch('https://translate.da.live/google', opts);
  if (!resp.ok) return;

  const { translated: html } = await resp.json();
  if (html) {
    url.sourceContent = await removeDnt({ html, org, site, ext: url.ext });
    url.destination = `/${org}/${site}${url.daDestPath}`;
  }
}

export const dnt = { addDnt };

export async function isConnected() {
  return true;
}

export async function sendAllLanguages({ org, site, langs, urls, options, actions }) {
  const { sendMessage, saveState } = actions;
  const sourceLanguage = options['source.language']?.location || '/';

  const translateUrl = async (url) => {
    await sendForTranslation(org, site, url);
  };

  for (const lang of langs) {
    sendMessage({ text: `Sending ${lang.name} for translation.` });
    const queue = new Queue(translateUrl, 50);
    const langUrls = urls.map((url) => {
      const conf = {
        path: url.suppliedPath,
        sourcePrefix: sourceLanguage,
        destPrefix: lang.location,
      };
      const converted = convertPath(conf);
      return {
        ...url,
        ...converted,
        code: lang.code,
      };
    });

    await Promise.all(langUrls.map((url) => queue.push(url)));
    lang.translation = {
      sent: urls.length,
      translated: urls.length,
      status: 'translated',
    };
    results[lang.code] = langUrls;
    sendMessage();
    saveState();
  }
}

export async function getStatusAll() {
  // Empty
}

export async function saveItems({ lang, saveToDa }) {
  const downloadCallback = async (url) => {
    await saveToDa(url);
  };

  const langUrls = results[lang.code];

  const queue = new Queue(downloadCallback, 5);
  await Promise.all(langUrls.map((url) => queue.push(url)));
  return langUrls;
}
