import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { Queue } from '../../../../public/utils/tree.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { mergeCopy, overwriteCopy } from '../../project/index.js';
import { convertPath } from '../../utils/utils.js';

function getTitle(status) {
  const title = {
    'not started': 'Ready',
    'not ready': 'Not ready',
    'rolling out': 'Rolling out',
    complete: 'Complete',
  };

  return title[status];
}

function calcActionStatus(name, lang) {
  return lang[name]?.status || 'not started';
}

function getRespStatusText(status) {
  const codeToText = {
    404: 'Not found',
    401: 'Not authorized',
    403: 'Not authorized',
  };
  return codeToText[status];
}

async function fetchLangSources(lang, urls) {
  const fetchUrl = async (url) => {
    const resp = await daFetch(`${DA_ORIGIN}/source${url.source}`);
    if (!resp.ok) {
      url.error = `Error fetching content from ${url.source} - ${getRespStatusText(resp.status)}`;
      return url;
    }

    const content = await resp.text();

    if (content.includes('da-diff-added') || content.includes('da-diff-deleted')
      // TODO: Remove da-loc-* once we've migrated all regional edits to the new loc tags
      || content.includes('da-loc-added') || content.includes('da-loc-deleted')) {
      url.error = `${url.source} has unmerged changes. Please resolve before rolling out.`;
      return url;
    }

    url.content = content;

    return url;
  };
  const queue = new Queue(fetchUrl, 50);
  await Promise.all(urls.map((url) => queue.push(url)));

  // Setup the results obj
  const results = { urls };

  // Find any errors and dedupe them
  const errors = urls.reduce((acc, url) => {
    if (url.error) {
      const found = acc.find((errorUrl) => errorUrl.error === url.error);
      if (!found) acc.push(url);
    }
    return acc;
  }, []);

  // If errors, add them to results
  if (errors.length) {
    results.errors = errors;
    results.message = { text: `Errors validating content from ${lang.name}.`, type: 'error' };
  }

  return results;
}

async function rolloutLangLocales(title, lang, urls, behavior) {
  const rolloutUrl = async (url) => {
    const overwrite = behavior === 'overwrite' || url.hasExt;
    const copyFn = overwrite ? overwriteCopy : mergeCopy;
    await copyFn(url, title);
  };

  const queue = new Queue(rolloutUrl, 50);
  await Promise.all(urls.map((url) => queue.push(url)));

  // Setup the results obj
  const results = { urls };

  // Find any errors and dedupe them
  const errors = urls.reduce((acc, url) => {
    if (url.error) {
      const found = acc.find((errorUrl) => errorUrl.error === url.error);
      if (!found) acc.push(url);
    }
    return acc;
  }, []);

  // If errors, add them to results
  if (errors.length) {
    results.errors = errors;
    results.message = { text: `Errors rolling out content from ${lang.name}.`, type: 'error' };
  }

  return results;
}

function formatLangUrls(org, site, sourceLocation, lang, urls) {
  return urls.map((url) => {
    const convertConf = {
      path: url.suppliedPath,
      sourcePrefix: sourceLocation,
      destPrefix: lang.location,
    };
    const { daDestPath, aemBasePath, ext } = convertPath(convertConf);
    const source = `/${org}/${site}${daDestPath}`;
    return { source, aemBasePath, ext };
  });
}

function formatRolloutUrls(org, site, lang, urls) {
  return lang.locales.reduce((acc, locale) => {
    const localeUrls = urls.map((langUrl) => {
      const { daDestPath } = convertPath({ path: langUrl.aemBasePath, destPrefix: locale.code });
      return {
        hasExt: langUrl.ext === 'json',
        sourceContent: langUrl.content,
        destination: `/${org}/${site}${daDestPath}`,
      };
    });
    acc.push(...localeUrls);
    return acc;
  }, []);
}

export async function rolloutLang({
  org,
  site,
  title,
  options,
  lang,
  urls: projectUrls,
  actions,
}) {
  lang.rollout.status = 'rolling out';
  actions.requestUpdate();

  const sourceLocation = options['source.language']?.location || '/';
  const behavior = options['rollout.conflict.behavior'];

  // Determine all sources are valid before continuing
  const langUrls = formatLangUrls(org, site, sourceLocation, lang, projectUrls);
  let { errors, message, urls } = await fetchLangSources(lang, langUrls);
  if (errors) return { errors, message };

  // Convert base lang urls to the full locale list
  const urlsToSave = formatRolloutUrls(org, site, lang, urls);

  // Perform the actual rollout
  ({ errors, message, urls } = await rolloutLangLocales(title, lang, urlsToSave, behavior));
  if (errors) return { errors, message };

  // The presumption is that no errors means success
  lang.rollout.status = 'complete';
  lang.rollout.saved = urls.length;
  lang.locales.forEach((locale) => {
    locale.saved = projectUrls.length;
  });

  actions.requestUpdate();

  return { };
}

function getRolloutDetails(lang) {
  const { action, rollout } = lang;

  // If we already know the rollout state,
  // there's no need to calculate anything else.
  if (rollout) return rollout;

  let actionStatus;
  if (action === 'copy') actionStatus = calcActionStatus('copy', lang);
  if (action === 'translate') actionStatus = calcActionStatus('translation', lang);

  const status = actionStatus === 'complete' || action === 'rollout' ? 'not started' : 'not ready';

  return { status };
}

export function sortLangs(langs) {
  // Filter out any langs that do not have locales
  const filtered = langs.filter((lang) => lang.locales.length && lang.translation?.status !== 'cancelled');

  return filtered.map((lang) => {
    const rollout = getRolloutDetails(lang);

    return {
      ...lang,
      expand: true,
      rollout,
    };
  });
}

export function getFilteredLangs(sortedLangs, filters) {
  return sortedLangs.reduce((acc, lang) => {
    const { status } = lang.rollout;

    // Determine if the lang belongs in the filtered view
    // Fallback to true if there are no filters
    const isFiltered = filters?.length
      ? filters.some((filterStatus) => status === filterStatus)
      : true;

    if (isFiltered) {
      const canRollout = status === 'not started' || status === 'complete';

      acc[status] ??= {
        title: getTitle(status),
        langs: [],
        status,
        canRollout,
      };
      acc[status].langs.push(lang);
    }

    return acc;
  }, {});
}

export function getSummaryCards() {
  return [
    {
      title: 'All languages',
      styles: ['summary-card-all'],
    },
    {
      title: 'Not ready',
      styles: ['summary-card-not-ready'],
      filter: ['not ready'],
    },
    {
      title: 'Ready',
      styles: ['summary-card-ready'],
      filter: ['rolling out', 'not started'],
    },
    {
      title: 'Complete',
      styles: ['summary-card-complete'],
      filter: ['complete'],
    },
  ];
}
