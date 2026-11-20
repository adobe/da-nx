import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { daFetch } from '../../../../../nx2/utils/api.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import {
  convertPath, createSnapshotPrefix, findSourceLocation, getProjectSourceLocations,
} from '../../utils/utils.js';

const MAX_LENGTH = 5000;
const results = new Map();
const resultKey = ({ org, site, path }, lang) => JSON.stringify([org, site, path, lang.code]);

const retryMessage = 'This tab no longer has the Google results for these pages.';

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
    if (!resp.ok) throw new Error(resp.status || 'no response');

    const { translated } = await resp.json();
    if (!translated) throw new Error('no translation returned');
    translatedParts.push(translated);
  }

  let html = translatedParts.join('');
  if (rejoin) html = rejoin(html);
  if (!html) throw new Error('no translation returned');
  url.sourceContent = await removeDnt({ html, org, site, ext: url.ext });
}

async function translatePages({ org, site, urls }) {
  const queue = new Queue(async (url) => {
    delete url.error;
    try {
      await sendForTranslation(org, site, url);
    } catch (error) {
      url.status = 'error';
      url.error = `Error translating ${url.suppliedPath} to ${url.code} - ${error.message}`;
    }
  }, 50);
  await Promise.all(urls.map(queue.push));
}

export function getPageErrors({ langs, ...project }) {
  return langs.flatMap((lang) => (results.get(resultKey(project, lang)) || [])
    .filter((url) => url.error));
}

export const requiredKeys = [];

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
export function getLangUrls({
  urls, lang, sourceLocations, defaultLocation, snapshotPrefix,
}) {
  return urls.map((url) => {
    const sourcePrefix = findSourceLocation({ path: url.suppliedPath, locations: sourceLocations })
      || defaultLocation;
    const converted = convertPath({
      path: url.suppliedPath,
      sourcePrefix,
      destPrefix: lang.location,
      snapshotPrefix,
    });
    return { ...url, ...converted, code: lang.code };
  });
}

export async function sendAllLanguages({
  org, site, path, langs, langsWithUrls, options, actions, snapshot, ...project
}) {
  const { sendMessage, saveState } = actions;
  const sourceLocations = getProjectSourceLocations({ ...project, options, langs });
  const defaultLocation = options['source.language']?.location || '/';

  for (const lang of langs) {
    sendMessage({ text: `Sending ${lang.name} for translation.` });
    const sourceUrls = langsWithUrls.find(({ code }) => code === lang.code)?.urls;
    const urls = getLangUrls({
      urls: sourceUrls,
      lang,
      sourceLocations,
      defaultLocation,
      snapshotPrefix: createSnapshotPrefix(snapshot),
    }).map((url) => ({ ...url, destination: `/${org}/${site}${url.daDestPath}` }));

    await translatePages({ org, site, urls });
    lang.translation = {
      sent: urls.length,
      translated: urls.filter((url) => url.sourceContent !== undefined).length,
      status: 'translated',
    };
    results.set(resultKey({ org, site, path }, lang), urls);
    sendMessage();
    await saveState(undefined, { waitForSave: true });
  }
}

export async function getStatusAll({ langs, ...project }) {
  const { org, site } = project;
  const incomplete = langs.filter((lang) => ['error', 'translated'].includes(lang.translation?.status));
  let missingResults = false;
  for (const lang of incomplete) {
    const urls = results.get(resultKey(project, lang));
    if (!urls) {
      lang.translation.status = 'error';
      missingResults = true;
    } else if (lang.translation.status === 'error') {
      const failed = urls.filter((url) => url.sourceContent === undefined);
      await translatePages({ org, site, urls: failed });
      lang.translation.translated = urls.filter((url) => url.sourceContent !== undefined).length;
      lang.translation.status = 'translated';
    }
  }
  return missingResults ? { message: { text: retryMessage, type: 'error' } } : undefined;
}

export async function saveItems({ lang, urls, saveFn, ...project }) {
  const key = resultKey(project, lang);
  const translated = results.get(key);
  if (!translated) return urls.map((url) => ({ ...url, status: 'error', error: retryMessage }));

  const pending = translated.filter((url) => url.sourceContent !== undefined && url.status !== 'success');
  const queue = new Queue(async (url) => {
    delete url.error;
    await saveFn(url);
  }, 5);
  await Promise.all(pending.map(queue.push));
  if (translated.length === urls?.length && translated.every((url) => url.status === 'success')) {
    results.delete(key);
  }
  return translated;
}
