const DA_ORIGIN = 'https://admin.da.live';
const PROJ_PATH = window.location.hash.replace('#', '');
const [org, repo] = PROJ_PATH.split('/').slice(1);
const CONF_PATH = `/${org}/${repo}/.da`;

async function fetchData(path) {
  const resp = await fetch(path);
  if (!resp.ok) return null;
  const { data } = await resp.json();
  return data;
}

function matchLangsLocales(langs, localesArr) {
  const locales = localesArr.reduce((acc, locale) => {
    locale.locales = locale.locales.split(',');
    acc[locale.code] = locale;
    return acc;
  }, {});
  return langs.map((lang) => ({ ...lang, ...locales[lang.code] }));
}

async function getProjectConfig() {
  // Load data in parallel
  const loadProjData = fetchData(`${DA_ORIGIN}/source${PROJ_PATH}/config.json`);
  const loadLocaleData = fetchData(`${DA_ORIGIN}/source${CONF_PATH}/locales.json`);
  const [projData, locales] = await Promise.all([loadProjData, loadLocaleData]);

  // A bit brittle to always assume name is always first, but we own this format.
  const nameRow = projData.shift();
  // Only langs are left over
  const langSplit = projData.map(
    (langs) => ({ code: langs.key, action: langs.value, complete: 0 }),
  );
  const langs = matchLangsLocales(langSplit, locales);
  return { name: nameRow.value, langs };
}

async function getUrls() {
  const data = await fetchData(`${DA_ORIGIN}/source${PROJ_PATH}/urls.json`);
  return data.map((row) => {
    const { pathname } = new URL(row.url);
    const daSource = `${pathname}.html`;
    return { href: row.url, pathname, daSource };
  });
}

export async function getDetails() {
  const urlsLoaded = getUrls();
  const configLoaded = getProjectConfig();
  const [urls, config] = await Promise.all([urlsLoaded, configLoaded]);
  return { urls, name: config.name, langs: config.langs };
}

export async function copy({ source, destination }) {
  const path = `/${org}/${repo}${source}`;

  const body = new FormData();
  body.append('destination', `/${org}/${repo}${destination}`);

  const opts = { method: 'POST', body };

  return new Promise((resolve) => {
    (async () => {
      fetch(`${DA_ORIGIN}/copy${path}`, opts).then(() => { resolve(); });
    })();
  });
}
