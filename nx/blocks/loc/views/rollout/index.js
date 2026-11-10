import { DA_ADMIN } from '../../../../../nx2/utils/utils.js';
import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { daFetch } from '../../../../../nx2/utils/api.js';
import { MAX_CONCURRENT_READS, MAX_CONCURRENT_WRITES } from '../../project/index.js';
import {
  copy,
  convertPath,
  createSnapshotPrefix,
  findSourceLocation,
  getProjectSourceLocations,
} from '../../utils/utils.js';
import { createRolloutResolver } from '../../utils/placeholders.js';

const COPY_FNS = new Map([['overwrite', copy.overwriteCopy], ['smart-overwrite', copy.smartOverwriteCopy]]);

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
    const resp = await daFetch({ url: `${DA_ADMIN}/source${url.source}` });
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
  const queue = new Queue(fetchUrl, MAX_CONCURRENT_READS);
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

async function rolloutLangLocales(title, lang, urls, behavior, resolver, sync) {
  const rolloutUrl = async (url) => {
    const { content, error } = await resolver.expand({
      content: url.sourceContent,
      root: url.root,
      path: url.destination,
    });
    if (error) {
      url.status = 'error';
      url.error = error;
      return;
    }
    url.sourceContent = content;
    if (sync) {
      await copy.markInSync(url, sync);
      return;
    }
    const copyFn = url.hasExt ? copy.overwriteCopy : (COPY_FNS.get(behavior) || copy.mergeCopy);
    await copyFn(url, title, { recordBaseline: true });
  };

  const queue = new Queue(rolloutUrl, MAX_CONCURRENT_WRITES);
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
    const action = sync ? 'marking in sync' : 'rolling out';
    results.message = { text: `Errors ${action} content from ${lang.name}.`, type: 'error' };
  }

  return results;
}

export function formatLangUrls(org, site, sourceLocations, lang, urls, snapshot) {
  const snapshotPrefix = createSnapshotPrefix(snapshot);
  return urls.map((url) => {
    const convertConf = {
      path: url.suppliedPath,
      sourcePrefix: findSourceLocation({ path: url.suppliedPath, locations: sourceLocations }),
      destPrefix: lang.location,
      snapshotPrefix,
    };
    const { daDestPath, aemBasePath, ext } = convertPath(convertConf);
    const source = `/${org}/${site}${daDestPath}`;
    return { source, aemBasePath, ext };
  });
}

function formatRolloutUrls(org, site, lang, urls, snapshot) {
  const snapshotPrefix = createSnapshotPrefix(snapshot);
  return lang.locales.reduce((acc, locale) => {
    const localeUrls = urls.map((langUrl) => {
      const { daDestPath } = convertPath({
        path: langUrl.aemBasePath,
        sourcePrefix: snapshotPrefix,
        destPrefix: locale.code,
        snapshotPrefix,
      });
      return {
        hasExt: langUrl.ext === 'json',
        root: locale.code,
        sourceContent: langUrl.content,
        source: langUrl.source,
        destination: `/${org}/${site}${daDestPath}`,
      };
    });
    acc.push(...localeUrls);
    return acc;
  }, []);
}

async function prepareLangRollout({
  org, site, snapshot, options, langs, lang, urls: projectUrls, sourceLocations: projectLocations,
  pagesOnly = false,
}) {
  const sourceLocations = getProjectSourceLocations({
    sourceLocations: projectLocations,
    options,
    langs,
  });

  // Determine all sources are valid before continuing
  const allUrls = formatLangUrls(org, site, sourceLocations, lang, projectUrls, snapshot);
  // Mark in sync never touches sheets, so they are counted without reading their source.
  const sheets = pagesOnly ? allUrls.filter(({ ext }) => ext === 'json') : [];
  const langUrls = allUrls.filter((url) => !sheets.includes(url));
  const { errors, message, urls } = await fetchLangSources(lang, langUrls);
  if (errors) return { errors, message };

  // Convert base lang urls to the full locale list
  const urlsToSave = formatRolloutUrls(org, site, lang, [...urls, ...sheets], snapshot);
  const load = (path) => daFetch({ url: `${DA_ADMIN}/source${path}` });
  const resolver = createRolloutResolver({ load, sitePath: `/${org}/${site}` });
  return { urlsToSave, resolver };
}

export async function rolloutLang(conf) {
  const {
    title, options, lang, actions,
  } = conf;
  lang.rollout.status = 'rolling out';
  actions.requestUpdate();

  const prepared = await prepareLangRollout(conf);
  if (prepared.errors) return prepared;
  const { urlsToSave, resolver } = prepared;
  const behavior = options['rollout.conflict.behavior'];

  // Perform the actual rollout
  const { errors, message, urls } = await rolloutLangLocales(
    title,
    lang,
    urlsToSave,
    behavior,
    resolver,
  );

  const saved = urls.filter((url) => url.status === 'success');
  lang.rollout.status = errors ? 'not started' : 'complete';
  lang.rollout.saved = saved.length;
  lang.locales.forEach((locale) => {
    const localeSaved = saved.filter((url) => url.root === locale.code);
    locale.saved = localeSaved.length;
    const skipped = localeSaved.reduce((sum, url) => sum + (url.skipped || 0), 0);
    if (skipped) locale.skipped = skipped;
    else delete locale.skipped;
  });

  actions.requestUpdate();

  return errors ? { errors, message } : {};
}

const countSync = (urls) => urls.reduce((acc, { sync, differences }) => {
  if (sync) acc[sync] = (acc[sync] || 0) + 1;
  if (differences) acc.differences = (acc.differences || 0) + differences;
  return acc;
}, {});

// Confirming marks the source content the dry run checked, not whatever the source is by then.
export async function markLangInSync({ dryRun = false, ...conf }) {
  const { title, lang, actions } = conf;
  const checked = !dryRun && lang.sync?.status === 'checked' ? lang.sync.prepared : undefined;
  lang.sync = { status: dryRun ? 'checking' : 'marking' };
  actions.requestUpdate();
  try {
    const prepared = checked || await prepareLangRollout({ ...conf, pagesOnly: true });
    if (prepared.errors) {
      delete lang.sync;
      return prepared;
    }
    const { errors, message, urls } = await rolloutLangLocales(
      title,
      lang,
      prepared.urlsToSave,
      undefined,
      prepared.resolver,
      { dryRun },
    );
    const locales = Object.fromEntries(lang.locales.map(({ code }) => (
      [code, countSync(urls.filter((url) => url.root === code))])));
    lang.sync = {
      status: dryRun ? 'checked' : 'marked',
      ...countSync(urls),
      locales,
      ...(dryRun ? { prepared } : {}),
    };
    return errors ? { errors, message } : {};
  } catch (error) {
    delete lang.sync;
    return { message: { text: `Could not mark ${lang.name} in sync: ${error.message}`, type: 'error' } };
  } finally {
    actions.requestUpdate();
  }
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
