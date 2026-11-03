import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { daFetch } from '../../../../../nx2/utils/api.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import { convertPath, findSourceLocation, getProjectSourceLocations } from '../../utils/utils.js';

const MAX_LENGTH = 5000;
const results = new Map();

const translateError = (url, reason) => `Error translating ${url.daBasePath} to ${url.code} - ${reason}`;

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
    if (!resp.ok) {
      url.error = translateError(url, resp.status || 'no response');
      return;
    }

    const { translated } = await resp.json();
    if (!translated) {
      url.error = translateError(url, 'no translation returned');
      return;
    }
    translatedParts.push(translated);
  }

  let html = translatedParts.join('');
  if (rejoin) html = rejoin(html);
  if (html) {
    url.sourceContent = await removeDnt({ html, org, site, ext: url.ext });
    url.destination = `/${org}/${site}${url.daDestPath}`;
  }
}

async function translateUrl(org, site, url) {
  try {
    await sendForTranslation(org, site, url);
  } catch (e) {
    url.error = translateError(url, e.message);
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
  org, site, langs, langsWithUrls, options, actions, ...project
}) {
  const { sendMessage, saveState } = actions;
  const sourceLocations = getProjectSourceLocations({ ...project, options, langs });
  const defaultLocation = options['source.language']?.location || '/';

  const errors = [];

  for (const [idx, lang] of langs.entries()) {
    sendMessage({ text: `Sending ${lang.name} for translation.` });
    const queue = new Queue((url) => translateUrl(org, site, url), 50);

    // Find the URLs from the lang that has the URLs (custom source URLs)
    const langUrls = getLangUrls({
      urls: langsWithUrls[idx].urls,
      lang,
      sourceLocations,
      defaultLocation,
    });

    await Promise.all(langUrls.map((url) => queue.push(url)));

    const failed = langUrls.filter((url) => url.error);
    lang.translation = {
      sent: langUrls.length,
      translated: langUrls.length - failed.length,
      status: 'translated',
    };
    results.set(lang.code, langUrls);
    errors.push(...failed);
    sendMessage();
    await saveState();
  }

  return errors.length ? { errors } : undefined;
}

export async function getStatusAll({ org, site, langs }) {
  const retryLangs = langs.filter((lang) => lang.translation?.status === 'error' && results.has(lang.code));
  if (!retryLangs.length) return undefined;

  const errors = [];
  for (const lang of retryLangs) {
    const langUrls = results.get(lang.code);
    langUrls.filter((url) => url.error).forEach((url) => { delete url.error; });
    const failed = langUrls.filter((url) => !url.sourceContent);

    const queue = new Queue((url) => translateUrl(org, site, url), 50);
    await Promise.all(failed.map((url) => queue.push(url)));

    const stillFailed = langUrls.filter((url) => url.error);
    lang.translation.translated = langUrls.length - stillFailed.length;
    lang.translation.status = 'translated';
    errors.push(...stillFailed);
  }
  return { errors };
}

export async function saveItems({ lang, saveFn }) {
  const downloadCallback = async (url) => {
    if (url.status === 'success') return;
    if (url.error) {
      url.status = 'error';
      return;
    }
    await saveFn(url);
  };

  const langUrls = results.get(lang.code);

  const queue = new Queue(downloadCallback, 5);
  await Promise.all(langUrls.map((url) => queue.push(url)));
  return langUrls;
}
