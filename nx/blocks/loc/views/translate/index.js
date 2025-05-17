import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { Queue } from '../../../../public/utils/tree.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { getHasExt } from '../../utils/utils.js';

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

  // Determine if we need to add index
  const indexedPath = path.endsWith('/') ? `${path}index` : path;

  // Determine if supplied path needs source location added
  const toTranslatePath = hasSourceLocaction ? indexedPath : `${sourceLocation}${indexedPath}`;

  // Determine a source location for DA Admin
  const langPath = getHasExt(toTranslatePath) ? toTranslatePath : `${toTranslatePath}.html`;
  const daLangPath = `/${org}/${site}${langPath}`;

  // Determine if lang agnostic path needs source location removed
  const basePath = hasSourceLocaction ? indexedPath : indexedPath.replace(sourceLocation, '');

  // Where would this live on AEM?
  const aemHref = `https://main--${site}--${org}.aem.page${path}`;

  return { daLangPath, aemHref, basePath, toTranslatePath };
}

export async function fetchContent(org, site, sourceLocation, urls) {
  // Format the URLs to get all possible path variations
  const formattedUrls = urls.map((url) => {
    const formatted = formatPath(org, site, sourceLocation, url.suppliedPath);
    return { ...url, ...formatted };
  });

  // Fetch the actual content
  const fetchUrl = async (url) => {
    const resp = await daFetch(`${DA_ORIGIN}/source${url.daLangPath}`);
    if (!resp.ok) {
      url.error = `Error fetching content from ${url.daLangPath} - ${resp.status}`;
      return;
    }
    url.content = await resp.text();
  };

  const queue = new Queue(fetchUrl, 50);

  await Promise.allSettled(formattedUrls.map((url) => queue.push(url)));

  return { urls: formattedUrls };
}
