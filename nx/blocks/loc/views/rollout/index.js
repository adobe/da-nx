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

function formatRolloutUrls(locale, urls) {
  console.log(urls);
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

export async function rolloutLang({ lang, urls, actions, onConflict }) {
  lang.rollout.status = 'rolling out';
  actions.requestUpdate();
  const urlsToSave = formatRolloutUrls(lang.locales, urls);
  return {};
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
