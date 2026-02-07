import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { Queue } from '../../../../public/utils/tree.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { convertPath, createSnapshotPrefix, fetchConfig } from '../../utils/utils.js';
import { mergeCopy, overwriteCopy } from '../../project/index.js';

let CONNECTOR;

export async function setupConnector(service) {
  const serviceName = service.name.toLowerCase().replaceAll(' ', '-');
  CONNECTOR = await import(`../../connectors/${serviceName}/index.js`);
  return CONNECTOR;
}

export async function getUrls(
  org,
  site,
  service,
  sourceLocation,
  destLocation,
  urls,
  fetchContent,
  snapshot,
) {
  const { connector } = service;
  const snapshotPrefix = createSnapshotPrefix(snapshot);

  // Format the URLs to get all possible path variations
  const formattedUrls = urls.map((url) => {
    const converConf = {
      path: url.basePath,
      sourcePrefix: sourceLocation,
      destPrefix: destLocation,
      snapshotPrefix,
    };
    const formatted = convertPath(converConf);

    return {
      ...url,
      ...formatted,
      aemHref: `https://main--${site}--${org}.aem.page${formatted.aemBasePath}`,
    };
  });

  // Only fetch the content if needed
  if (fetchContent) {
    const config = await fetchConfig(org, site);

    // Fetch the content and add DNT
    const fetchUrl = async (url) => {
      const resp = await daFetch(`${DA_ORIGIN}/source/${org}/${site}${url.daDestPath}`);
      if (!resp.ok) {
        url.error = `Error fetching content from ${url.daDestPath} - ${resp.status}`;
        return;
      }

      const content = await resp.text();

      if (content.includes('da-diff-added') || content.includes('da-diff-deleted')
        // TODO: Remove da-loc-* once we've migrated all regional edits to the new loc tags
        || content.includes('da-loc-added') || content.includes('da-loc-deleted')) {
        url.error = `${url.daBasePath} has unmerged changes. Please resolve before translating.`;
        return;
      }

      const fileType = url.daBasePath.includes('.json') ? 'json' : undefined;

      // Only add DNT if a connector exists
      // Copy sources will not have a connector
      url.content = content;
      if (connector) {
        try {
          url.content = await connector.dnt.addDnt(content, config, { fileType });
        } catch (error) {
          url.error = `Error adding DNT to ${url.daBasePath} - ${error.message}`;
        }
      }
    };

    const queue = new Queue(fetchUrl, 50);

    await Promise.allSettled(formattedUrls.map((url) => queue.push(url)));
  }

  return { urls: formattedUrls };
}

async function saveLang({
  org,
  site,
  snapshot,
  title,
  service,
  connector,
  behavior,
  lang,
  langIndex,
  urls,
  sendMessage,
}) {
  const snapshotPrefix = createSnapshotPrefix(snapshot);

  const urlsToSave = urls.map((url) => {
    const { daDestPath } = convertPath({ path: url.basePath, sourcePrefix: '/', destPrefix: lang.location, snapshotPrefix });
    return { ...url, destination: `/${org}/${site}${daDestPath}` };
  });

  const saveToDa = async (url) => {
    const overwrite = behavior === 'overwrite' || url.hasExt || url.ext !== 'html';
    const copyFn = overwrite ? overwriteCopy : mergeCopy;
    await copyFn(url, title);
    const remaining = urlsToSave.filter((urlToSave) => !urlToSave.sourceContent).length;
    sendMessage({ text: `${remaining} items left to save for ${lang.name}.` });
  };

  const saved = await connector.saveItems({
    org,
    site,
    service,
    lang,
    langIndex,
    urls: urlsToSave,
    saveToDa,
  });

  const savedCount = saved.filter((url) => url.status === 'success').length;
  return { savedCount };
}

export async function saveLangItemsToDa(options, conf, connector, sendMessage) {
  const behavior = options['translate.conflict.behavior'];

  const saveLangConf = { ...conf, connector, behavior, sendMessage };

  for (const [langIndex, lang] of conf.langs.entries()) {
    if (lang.translation.status !== 'complete') {
      sendMessage({ text: `Fetching ${conf.urls.length} items for ${lang.name}` });
      const { savedCount } = await saveLang({ ...saveLangConf, lang, langIndex });
      lang.translation.saved = savedCount;
      lang.translation.status = savedCount === conf.urls.length ? 'complete' : 'error';
    }
  }
}

export async function copySourceLangs(org, site, title, options, langs, urls, langsWithUrls) {
  const behavior = options['copy.conflict.behavior'];

  const copyUrl = async ({ lang, url }) => {
    const destination = `/${org}/${site}${lang.location}${url.basePath}.${url.ext}`;

    // If sheet, force overwrite
    const overwrite = behavior === 'overwrite' || url.ext === 'json';

    const copyFn = overwrite ? overwriteCopy : mergeCopy;
    const resp = await copyFn({ sourceContent: url.content, destination }, title);
    url.ok = resp.ok;
  };

  for (const [idx, lang] of langs.entries()) {
    const queue = new Queue(copyUrl, 50);

    // Find the URLs from the lang that has the URLs (custom source URLs)
    const langUrls = langsWithUrls[idx].urls.map((url) => (
      { ...url, code: lang.code }
    ));

    await Promise.allSettled(langUrls.map((url) => queue.push({ lang, url })));
    const success = langUrls.filter((url) => url.ok).length;
    lang.copy = {
      saved: success,
      status: 'complete',
    };
  }
}

export function removeWaitingLanguagesFromConf(conf) {
  return {
    ...conf,
    langs: conf.langs.filter((lang) => !lang.waitingFor),
  };
}

export async function sendAllForTranslation(conf, connector) {
  // Use langsWithUrls as our basis for checking for errors
  const langErrors = conf.langsWithUrls.reduce((acc, lang) => {
    const errors = lang.urls.filter((url) => url.error);
    if (errors.length) acc.push(...errors);
    return acc;
  }, []);
  if (langErrors.length) return { errors: langErrors };

  // Use langs here as this is what will persist to DA
  conf.langs.filter((lang) => lang.waitingFor).forEach((lang) => {
    if (!lang.translation) {
      lang.translation = {};
    }
    lang.translation.status = 'waiting';
  });
  return connector.sendAllLanguages(removeWaitingLanguagesFromConf(conf));
}

async function sendLanguageForTranslation(conf, connector, lang, originalUrls, sourceLocation) {
  const newSourceLocation = lang.waitingFor.location;
  const baseUrls = !sourceLocation ? originalUrls : originalUrls.map((url) => {
    const { suppliedPath: path } = url;
    return {
      ...url,
      suppliedPath: path.startsWith(sourceLocation) ? path.slice(sourceLocation.length) : path,
    };
  });
  const { org, site } = conf;
  const { urls } = await getUrls(
    org,
    site,
    { connector },
    newSourceLocation,
    newSourceLocation,
    baseUrls,
    true,
  );
  lang.translation.status = 'not started';
  delete lang.waitingFor;
  return connector.sendAllLanguages({
    ...conf,
    langs: [lang],
    urls,
  });
}

export async function checkWaitingLanguages(conf, connector, originalUrls, originalSourceLocation) {
  const waitingLangs = conf.langs.filter((lang) => (lang.waitingFor && lang.translation?.status === 'waiting'));

  const readyLangs = [];
  for (const waitingLang of waitingLangs) {
    const sourceLang = conf.langs.find((lang) => lang.code === waitingLang.waitingFor.code);
    if (sourceLang && (sourceLang.translation?.saved ?? 0) === conf.urls.length) {
      readyLangs.push(waitingLang);
    }
  }

  for (const lang of readyLangs) {
    await sendLanguageForTranslation(conf, connector, lang, originalUrls, originalSourceLocation);
  }
}
