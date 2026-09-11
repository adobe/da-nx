/**
 * Turns a loaded what's-new fragment into card entries. Expects the fragment
 * markup authored in DA: one `main > div` section per entry, each containing
 * a `<picture>`, an `<h3 id="...">` title (the id is used as the anchor for
 * scrollspy), and a body `<p>` that may contain a link — that link, if
 * present, becomes the entry's CTA target.
 * @param {HTMLElement} fragment root element returned by loadFragment()
 * @returns {{id: string, title: string, picture: Element|null,
 *   body: string, href: string|undefined}[]}
 */
export function parseWhatsNewEntries(fragment) {
  return [...fragment.children].reduce((entries, section) => {
    const h3 = section.querySelector('h3');
    if (!h3?.id) return entries;

    const picture = section.querySelector('picture');
    const body = [...section.querySelectorAll('p')].find((p) => !p.querySelector('picture'));
    const a = body?.querySelector('a');

    entries.push({
      id: h3.id,
      title: h3.textContent.trim(),
      picture,
      body: body?.textContent.trim() ?? '',
      href: a?.getAttribute('href'),
    });
    return entries;
  }, []);
}
