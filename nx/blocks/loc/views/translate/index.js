import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { Queue } from '../../../../public/utils/tree.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { fetchConfig, getHasExt } from '../../utils/utils.js';
import { mergeCopy, overwriteCopy } from '../../project/index.js';

let CONNECTOR;

export async function setupConnector(service) {
  const serviceName = service.name.toLowerCase().replaceAll(' ', '-');
  CONNECTOR = await import(`../../connectors/${serviceName}/index.js`);
  return CONNECTOR;
}

export function formatPath(org, site, sourceLocation, path) {
  const hasSourceLocaction = path.startsWith(sourceLocation)
    && path !== sourceLocation
    && sourceLocation !== '/';

  // Get site source prefix for later use in saving to other langs
  const sourceLangPrefix = `/${org}/${site}${sourceLocation}`;

  // Determine if we need to add index
  const indexedPath = path.endsWith('/') ? `${path}index` : path;

  // Determine if supplied path needs source location added
  const toTranslatePath = hasSourceLocaction ? indexedPath : `${sourceLocation}${indexedPath}`;

  const hasExt = getHasExt(toTranslatePath);

  // Determine a source location for DA Admin
  const langPath = hasExt ? toTranslatePath : `${toTranslatePath}.html`;
  const daLangPath = `/${org}/${site}${langPath}`;

  // Determine if lang agnostic path needs source location removed
  const basePath = hasSourceLocaction ? indexedPath : indexedPath.replace(sourceLocation, '');

  // daBasePath is used as a language agnostic identifier for localization services
  const daBasePath = hasExt ? basePath : `${basePath}.html`;

  // Where would this live on AEM?
  const aemHref = `https://main--${site}--${org}.aem.page${path}`;

  return {
    sourceLangPrefix,
    daLangPath,
    daBasePath,
    aemHref,
    basePath,
    toTranslatePath,
    hasExt,
  };
}

export async function getUrls(org, site, service, sourceLocation, urls, fetchContent) {
  const { connector } = service;

  // Format the URLs to get all possible path variations
  const formattedUrls = urls.map((url) => {
    const formatted = formatPath(org, site, sourceLocation, url.suppliedPath);
    return { ...url, ...formatted };
  });

  // Only fetch the content if needed
  if (fetchContent) {
    const config = await fetchConfig(org, site);

    // Fetch the content and add DNT
    const fetchUrl = async (url) => {
      const resp = await daFetch(`${DA_ORIGIN}/source${url.daLangPath}`);
      if (!resp.ok) {
        url.error = `Error fetching content from ${url.daLangPath} - ${resp.status}`;
        return;
      }

      const content = await resp.text();

      if (content.includes('da-loc-added') || content.includes('da-loc-deleted')) {
        url.error = `${url.daLangPath} has unmerged changes. Please resolve before translating.`;
        return;
      }

      const fileType = url.daLangPath.includes('.json') ? 'json' : undefined;

      url.content = await connector.dnt.addDnt(content, config, { fileType });
    };

    const queue = new Queue(fetchUrl, 50);

    await Promise.allSettled(formattedUrls.map((url) => queue.push(url)));
  }

  return { urls: formattedUrls };
}

async function saveLang(lang, {
  org,
  site,
  title,
  service,
  connector,
  behavior,
  urls,
}) {
  const saveCallback = async (url) => {
    const overwrite = behavior === 'overwrite' || url.hasExt;
    const copyFn = overwrite ? overwriteCopy : mergeCopy;
    await copyFn(url, title);
  };

  const destLangPrefix = `/${org}/${site}${lang.location}`;

  const items = await connector.getItems({ org, site, service, lang, urls });
  const urlsToSave = items.map((url) => ({
    sourceContent: url.content,
    destination: url.daLangPath.replace(url.sourceLangPrefix, destLangPrefix).toLowerCase(),
  }));

  const queue = new Queue(saveCallback, 50);
  await Promise.allSettled(urlsToSave.map((url) => queue.push(url)));

  const savedCount = urlsToSave.filter((url) => url.status === 'success').length;
  return { savedCount };
}

export async function saveLangs(options, conf, connector, sendMessage) {
  const behavior = options['translate.conflict.behavior'];

  const saveLangConf = { ...conf, connector, behavior };

  for (const lang of conf.langs) {
    sendMessage({ text: `Fetching ${conf.urls.length} items for ${lang.name}` });
    const { savedCount } = await saveLang(lang, saveLangConf);
    lang.translation.saved = savedCount;
    lang.translation.status = savedCount === conf.urls.length ? 'complete' : 'error';
  }
}
