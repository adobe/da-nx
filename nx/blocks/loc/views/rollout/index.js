import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { Queue } from '../../../../public/utils/tree.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { formatPath } from '../../utils/utils.js';

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

async function fetchLangSources(urls) {
  const fetchUrl = async (url) => {
    const resp = await daFetch(`${DA_ORIGIN}/source${url.source}`);
    if (!resp.ok) {
      url.error = `Error fetching content from ${url.source} - ${resp.status}`;
      return url;
    }

    const content = await resp.text();

    if (content.includes('da-loc-added') || content.includes('da-loc-deleted')) {
      url.error = `${url.source} has unmerged changes. Please resolve before rolling out.`;
      return url;
    }

    url.content = content;

    return url;
  };
  const queue = new Queue(fetchUrl, 50);
  await Promise.all(urls.map((url) => queue.push(url)));
  const errors = urls.filter((url) => url.error);
  return { errors, urls };
}

function formatRolloutUrls(org, site, sourceLocation, lang, urls) {
  const langUrls = urls.map((url) => {
    const { daBasePath } = formatPath(org, site, sourceLocation, url.suppliedPath);
    const source = `/${org}/${site}${lang.location}${daBasePath}`;
    return { source, daBasePath };
  });
  return lang.locales.reduce((acc, locale) => {
    const localeUrls = langUrls.map(
      (langUrl) => (
        {
          source: langUrl.source,
          destination: `/${org}/${site}${locale.code}${langUrl.daBasePath}`,
        }),
    );
    acc.push(...localeUrls);
    return acc;
  }, []);
}

export async function rolloutLang({
  org,
  site,
  options,
  lang,
  urls: projectUrls,
  actions,
}) {
  lang.rollout.status = 'rolling out';
  actions.requestUpdate();

  const sourceLocation = options['source.language']?.location || '/';
  const urlsToSave = formatRolloutUrls(org, site, sourceLocation, lang, projectUrls);

  // Determine all sources are valid before continuing
  const { langSourcesEerrors, langSources } = await fetchLangSources(urlsToSave);
  if (langSourcesEerrors) {
    return {
      errors,
      message: { text: `Errors fetching content from ${lang.name}.`, type: 'error' },
    };
  }

  const

  return {};
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
  // Filter out any langs that do not have
  const filtered = langs.filter((lang) => lang.locales.length);

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
