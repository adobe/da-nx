const DA_ORIGIN = 'https://admin.da.live';

function getDaUrl(url) {
  if (url.hostname === DA_ORIGIN) return url.href;
  const [repo, org] = url.hostname.split('.')[0].split('--').slice(1).slice(-2);
  return `${DA_ORIGIN}/source/${org}/${repo}${url.pathname}.html`;
}

async function parsePage(daUrl) {
  const resp = await fetch(daUrl);
  if (!resp.ok) return null;
  const html = await resp.text();
  const parser = new DOMParser();
  const page = parser.parseFromString(html, 'text/html');
  return page;
}

async function findPageFragments(url) {
  const { origin } = new URL(url);
  const daUrl = getDaUrl(url);
  const html = await parsePage(daUrl);
  if (!html) return [];
  const pageLinks = html.querySelectorAll('a');
  const pageFragments = [...pageLinks].reduce((fragments, link) => {
    const dupe = fragments.some((ac) => ac.href === link.href);
    if (dupe) return fragments;
    const { pathname } = new URL(link.href);
    if (pathname.includes('/fragments/')) {
      fragments.push(new URL(`${origin}${link.pathname}`));
    }
    return fragments;
  }, []);
  return pageFragments;
}

async function findNestedFragments(url) {
  const searched = [];
  const fragments = await findPageFragments(url);
  if (!fragments.length) return [];
  while (fragments.length !== searched.length) {
    const needsSearch = fragments.filter((fragment) => !searched.includes(fragment.pathname));
    for (const search of needsSearch) {
      const nestedFragments = await findPageFragments(search);
      const notSearched = nestedFragments.filter((nested) => !searched.includes(nested.pathname));
      if (notSearched?.length) fragments.push(...notSearched);
      searched.push(search.pathname);
    }
  }
  return fragments;
}

export async function findAllFragments(urls) {
  const foundFragments = await urls.map((url) => findNestedFragments(url));
  const pages = await Promise.all(foundFragments);
  const allFragments = pages.reduce((fragments, page) => {
    if (page.length > 0) {
      page.forEach((pageFragment) => {
        const dupe = fragments.some((fragment) => pageFragment.pathname === fragment.pathname);
        if (!dupe) fragments.push(pageFragment);
      });
    }
    return fragments;
  }, []);
  return allFragments;
}

export default { findAllFragments };
