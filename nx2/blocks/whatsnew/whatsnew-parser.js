function rewriteRelativeMedia(path, root) {
  const base = new URL(path, window.location);
  root.querySelectorAll('img[src^="./media_"], source[srcset^="./media_"], a[href^="./media_"]')
    .forEach((el) => {
      if (el.hasAttribute('src')) el.src = new URL(el.getAttribute('src'), base).href;
      if (el.hasAttribute('srcset')) el.srcset = new URL(el.getAttribute('srcset'), base).href;
      if (el.hasAttribute('href')) el.href = new URL(el.getAttribute('href'), base).href;
    });
}

/**
 * Reads the fragment page's `published-date` meta tag.
 * @param {string} path absolute URL to the fragment
 * @returns {Promise<string|null>} published date, or null if unavailable
 */
export async function fetchPublishedDate(path) {
  try {
    const resp = await fetch(path);
    if (!resp.ok) return null;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.querySelector('meta[name="published-date"]')?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Loads a what's-new fragment and returns parsed dialog data.
 * @param {string} path absolute URL to the fragment
 * @returns {Promise<{entries: {id: string, title: string, picture: Element|null,
 *   videoSrc: string|null, body: string}[], publishedDate: string|null} | null>}
 */
export async function loadEntries(path) {
  try {
    const resp = await fetch(path);
    if (!resp.ok) return null;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    rewriteRelativeMedia(path, doc);
    const fragment = document.createElement('div');
    fragment.append(...doc.body.querySelectorAll('main > div'));
    return {
      entries: parseEntries(fragment),
      publishedDate: doc.querySelector('meta[name="published-date"]')?.content ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Parses a what's-new fragment into dialog entries.
 * @param {HTMLElement} fragment root element containing entry sections
 * @returns {{id: string, title: string, picture: Element|null,
 *   videoSrc: string|null, body: string}[]}
 */
export function parseEntries(fragment) {
  return [...fragment.children].reduce((entries, section) => {
    const h3 = section.querySelector('h3');
    if (!h3?.id) return entries;

    const picture = section.querySelector('picture');
    const videoSrc = section.querySelector('a[href$=".mp4"]')?.getAttribute('href') ?? null;
    const body = [...section.querySelectorAll('p')].find(
      (p) => !p.querySelector('picture') && !p.querySelector('a[href$=".mp4"]'),
    );

    entries.push({
      id: h3.id,
      title: h3.textContent.trim(),
      picture,
      videoSrc,
      body: body?.textContent.trim() ?? '',
    });
    return entries;
  }, []);
}
