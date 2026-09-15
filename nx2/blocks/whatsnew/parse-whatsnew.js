/**
 * Reads the fragment page's own `published-date` meta tag — the freshness
 * signal used to decide whether to show the dot/auto-open (see
 * whatsNewFlags.js). loadFragment() strips <head> entirely (it only ever
 * returns `main > div` sections), so this does its own raw fetch rather
 * than reusing that.
 * @param {string} path absolute URL to the fragment
 * @returns {Promise<string|null>} the date string (e.g. "2026-09-10"), or
 *   null if unavailable
 */
export async function fetchPublishedDate(path) {
  const resp = await fetch(path);
  if (!resp.ok) return null;
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.querySelector('meta[name="published-date"]')?.content ?? null;
}

/**
 * Turns a loaded what's-new fragment into card entries. Expects the fragment
 * markup authored in DA: one `main > div` section per entry, each containing
 * a `<picture>`, an `<h3 id="...">` title (the id is used as the anchor for
 * scrollspy), and a body `<p>`.
 * @param {HTMLElement} fragment root element returned by loadFragment()
 * @returns {{id: string, title: string, picture: Element|null, body: string}[]}
 */
export function parseWhatsNewEntries(fragment) {
  return [...fragment.children].reduce((entries, section) => {
    const h3 = section.querySelector('h3');
    if (!h3?.id) return entries;

    const picture = section.querySelector('picture');
    const body = [...section.querySelectorAll('p')].find((p) => !p.querySelector('picture'));

    entries.push({
      id: h3.id,
      title: h3.textContent.trim(),
      picture,
      body: body?.textContent.trim() ?? '',
    });
    return entries;
  }, []);
}
