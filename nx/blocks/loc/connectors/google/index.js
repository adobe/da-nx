import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { daFetch } from '../../../../../nx2/utils/api.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import { convertPath, findSourceLocation, getSourceLocations } from '../../utils/utils.js';

const MAX_LENGTH = 5000;
const results = [];

async function sendForTranslation(org, site, url) {
  let chunks = [url.content];
  let rejoin;

  if (url.content.length > MAX_LENGTH) {
    const mod = await import('./splitHtml.js');
    chunks = mod.splitHtml(url.content, MAX_LENGTH);
    rejoin = mod.rejoinHtml;
  }

  const translatedParts = [];

  for (const chunk of chunks) {
    const body = new FormData();
    body.append('data', chunk);
    body.append('fromlang', 'en');
    body.append('tolang', url.code);

    const opts = { method: 'POST', body };
    const resp = await daFetch({ url: `${DA_TRANSLATE}/translate/google/${org}/${site}`, opts });
    if (!resp.ok) return;

    const { translated } = await resp.json();
    if (!translated) return;
    translatedParts.push(translated);
  }

  let html = translatedParts.join('');
  if (rejoin) html = rejoin(html);
  if (html) {
    url.sourceContent = await removeDnt({ html, org, site, ext: url.ext });
    url.destination = `/${org}/${site}${url.daDestPath}`;
  }
}

export const dnt = { addDnt };

export async function isConnected() {
  return true;
}

/**
 * Build the per-language urls with resolved source and destination paths.
 * @param {Object} config The config.
 * @param {Object[]} config.urls The project urls (suppliedPath).
 * @param {Object} config.lang The target language (code, location).
 * @param {string[]} config.sourceLocations Configured source locations.
 * @param {string} config.defaultLocation The default source location.
 * @returns {Object[]} The urls with converted paths and the language code.
 */
export function getLangUrls({ urls, lang, sourceLocations, defaultLocation }) {
  return urls.map((url) => {
    const sourcePrefix = findSourceLocation({ path: url.suppliedPath, locations: sourceLocations })
      || defaultLocation;
    const converted = convertPath({
      path: url.suppliedPath,
      sourcePrefix,
      destPrefix: lang.location,
    });
    return { ...url, ...converted, code: lang.code };
  });
}

export async function sendAllLanguages({
  org, site, langs, langsWithUrls, options, actions,
}) {
  const { sendMessage, saveState } = actions;
  const sourceLocations = getSourceLocations({ options, langs });
  const defaultLocation = options['source.language']?.location || '/';

  results.length = 0;

  const translateUrl = async (url) => {
    await sendForTranslation(org, site, url);
  };

  for (const [idx, lang] of langs.entries()) {
    sendMessage({ text: `Sending ${lang.name} for translation.` });
    const queue = new Queue(translateUrl, 50);

    // Find the URLs from the lang that has the URLs (custom source URLs)
    const langUrls = getLangUrls({
      urls: langsWithUrls[idx].urls,
      lang,
      sourceLocations,
      defaultLocation,
    });

    await Promise.all(langUrls.map((url) => queue.push(url)));

    lang.translation = {
      sent: langUrls.length,
      translated: langUrls.length,
      status: 'translated',
    };
    results.push(langUrls);
    sendMessage();
    await saveState();
  }
}

export async function getStatusAll() {
  // Empty
}

export async function saveItems({ langIndex, saveFn }) {
  const downloadCallback = async (url) => {
    await saveFn(url);
  };

  const langUrls = results[langIndex];

  const queue = new Queue(downloadCallback, 5);
  await Promise.all(langUrls.map((url) => queue.push(url)));
  return langUrls;
}
