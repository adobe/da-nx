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
 * Parses a what's-new fragment into dialog entries.
 * @param {HTMLElement} fragment root element returned by loadFragment()
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
