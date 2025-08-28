import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { Queue } from '../../../../public/utils/tree.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { convertPath, fetchConfig, formatPath } from '../../utils/utils.js';
import { mergeCopy, overwriteCopy } from '../../project/index.js';

let CONNECTOR;

export async function setupConnector(service) {
  const serviceName = service.name.toLowerCase().replaceAll(' ', '-');
  CONNECTOR = await import(`../../connectors/${serviceName}/index.js`);
  return CONNECTOR;
}

export async function getUrls(org, site, service, sourceLocation, urls, fetchContent) {
  const { connector } = service;

  // Format the URLs to get all possible path variations
  const formattedUrls = urls.map((url) => {
    const converConf = {
      path: url.suppliedPath,
      sourcePrefix: sourceLocation,
      destPrefix: sourceLocation,
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

      if (content.includes('da-loc-added') || content.includes('da-loc-deleted')) {
        url.error = `${url.daBasePath} has unmerged changes. Please resolve before translating.`;
        return;
      }

      const fileType = url.daBasePath.includes('.json') ? 'json' : undefined;

      // Only add DNT if a connector exists
      // Copy sources will not have a connector
      if (connector) {
        url.content = await connector.dnt.addDnt(content, config, { fileType });
      } else {
        url.content = content;
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
  title,
  service,
  connector,
  behavior,
  lang,
  urls,
  sendMessage,
}) {
  const urlsToSave = urls.map((url) => {
    const { daDestPath } = convertPath({ path: url.basePath, sourcePrefix: '/', destPrefix: lang.location });
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
    urls: urlsToSave,
    saveToDa,
  });

  const savedCount = saved.filter((url) => url.status === 'success').length;
  return { savedCount };
}

export async function saveLangItemsToDa(options, conf, connector, sendMessage) {
  const behavior = options['translate.conflict.behavior'];

  const saveLangConf = { ...conf, connector, behavior, sendMessage };

  for (const lang of conf.langs) {
    if (lang.translation.status !== 'complete') {
      sendMessage({ text: `Fetching ${conf.urls.length} items for ${lang.name}` });
      const { savedCount } = await saveLang({ ...saveLangConf, lang });
      lang.translation.saved = savedCount;
      lang.translation.status = savedCount === conf.urls.length ? 'complete' : 'error';
    }
  }
}

export async function copySourceLangs(org, site, title, options, langs, urls) {
  const behavior = options['copy.conflict.behavior'];
  const sourceLocation = options['source.language']?.location || '/';

  const copyUrl = async ({ lang, url }) => {
    const destination = `/${org}/${site}${url.langPath.replace(sourceLocation, lang.location)}`;

    // If has an ext (sheet), force overwrite
    const overwrite = behavior === 'overwrite' || url.hasExt;

    const copyFn = overwrite ? overwriteCopy : mergeCopy;
    const resp = await copyFn({ sourceContent: url.content, destination }, title);
    url.status = resp.status;
  };

  for (const lang of langs) {
    const queue = new Queue(copyUrl, 50);

    const formatted = urls.map((url) => ({
      ...url,
      ...formatPath(org, site, sourceLocation, url.suppliedPath),
    }));

    await Promise.allSettled(formatted.map((url) => queue.push({ lang, url })));
    const success = formatted.filter((url) => url.status === 200).length;
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
  const errors = conf.urls.filter((url) => url.error);
  if (errors.length) {
    return { errors };
  }

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
  const { urls } = await getUrls(org, site, { connector }, newSourceLocation, baseUrls, true);
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
