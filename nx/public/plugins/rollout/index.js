import { DA_ORIGIN } from '../../utils/constants.js';

const DA_TRANSLATE = '/.da/translate-qa.json';
const DA_SOURCE = `${DA_ORIGIN}/source/`;

async function fetchConf(org, repo, token) {
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  try {
    const resp = await fetch(`${DA_SOURCE}${org}/${repo}${DA_TRANSLATE}`, opts);
    return resp.json();
  } catch {
    console.log('Error fetching translation info.');
    return null;
  }
}

function getDestinationPath({ org, repo, currPrefix, destPrefix, sourcePath }) {
  const path = currPrefix === '/' ? `${destPrefix}${sourcePath}` : sourcePath.replace(currPrefix, destPrefix);
  return `/${org}/${repo}${path}`;
}

function formatPrefixes(org, repo, currPrefix, locales, path) {
  const prefixes = locales.split(',');

  return prefixes.map((prefix) => {
    const conf = {
      org,
      repo,
      currPrefix,
      destPrefix: prefix.replaceAll(' ', ''),
      sourcePath: path,
    };

    return {
      active: true,
      path: conf.destPrefix,
      source: `/${org}/${repo}${path}.html`,
      destination: `${getDestinationPath(conf)}.html`,
      edit: getDestinationPath(conf),
    };
  });
}

export default async function getPrefixDetails(org, repo, token, path) {
  const json = await fetchConf(org, repo, token);
  if (!json) return null;
  const { config, languages } = json;

  // Determine if path starts with a known language location
  const pathLang = languages.data.find((lang) => path.startsWith(`${lang.location}/`));
  if (pathLang) {
    return {
      currPrefix: pathLang.location,
      prefixes: formatPrefixes(org, repo, pathLang.location, pathLang.locales, path),
    };
  }

  // Determine if path starts with a known locale location
  const locales = languages.data.reduce((acc, lang) => {
    if (lang.locales) {
      const split = lang.locales.split(',').map((locale) => locale.trim());
      acc.push(...split);
    }
    return acc;
  }, []);
  const pathLocale = locales.find((locale) => path.startsWith(`${locale}/`));
  if (pathLocale) return { currPrefix: pathLocale, prefixes: [], isLocale: true };

  // Determine if there's a main source language
  const sourceLang = config.data.find((conf) => conf.key === 'source.language');
  if (!sourceLang) return { currPrefix: null, prefixes: [] };

  // Determine if there's a source language to rollout to from root
  const syncLang = languages.data.find((lang) => lang.name === sourceLang.value);
  if (!syncLang) return { currPrefix: null, prefixes: [] };

  return { currPrefix: '/', prefixes: formatPrefixes(org, repo, '/', syncLang.location, path) };
}
