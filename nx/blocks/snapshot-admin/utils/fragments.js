/* eslint-disable no-continue */
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';

const FRAGMENT_SELECTOR = 'a[href*="/fragments/"], .fragment a';

function getFragmentUrls(htmlText) {
  const parser = new DOMParser();
  const dom = parser.parseFromString(htmlText, 'text/html');

  // Get fragment URLs from anchor elements
  const anchorUrls = [...dom.body.querySelectorAll(FRAGMENT_SELECTOR)]
    .map((a) => a.getAttribute('href'));

  // Get fragment URLs from image alt attributes
  const imgAltUrls = [...dom.body.querySelectorAll('img[alt]')]
    .map((img) => {
      const alt = img.getAttribute('alt');
      if (alt.includes('/fragments/')) {
        const [href] = alt.split('|');
        if (href?.includes('/fragments/')) return href.trim();
      }
      return null;
    })
    .filter(Boolean);

  return [...anchorUrls, ...imgAltUrls];
}

function toPathname(href) {
  try {
    const { pathname } = new URL(href, 'https://placeholder.com');
    return pathname.endsWith('.html') ? pathname.replace('.html', '') : pathname;
  } catch {
    return null;
  }
}

export async function findFragments(resources, org, site) {
  const existingPaths = new Set(resources.map((res) => res.path));
  const visited = new Set();
  const discovered = [];

  const queue = [...resources];

  while (queue.length > 0) {
    const batch = queue.splice(0, 10);

    const results = await Promise.all(batch.map(async (res) => {
      const { path } = res;
      if (visited.has(path)) return [];
      visited.add(path);

      const extPath = path.endsWith('.json') ? path : `${path}.html`;
      const daUrl = `${DA_ORIGIN}/source/${org}/${site}${extPath}`;

      try {
        const resp = await daFetch(daUrl);
        if (!resp.ok) return [];
        const text = await resp.text();
        return getFragmentUrls(text);
      } catch {
        return [];
      }
    }));

    for (const hrefs of results) {
      for (const href of hrefs) {
        const pathname = toPathname(href);
        if (!pathname) continue;
        if (!pathname.includes('/fragments/')) continue;
        if (existingPaths.has(pathname)) continue;
        if (visited.has(pathname)) continue;

        existingPaths.add(pathname);
        discovered.push({ path: pathname, selected: true });
        queue.push({ path: pathname });
      }
    }
  }

  return discovered;
}
