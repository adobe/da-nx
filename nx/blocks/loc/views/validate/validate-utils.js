const FRAGMENT_SELECTOR = 'a[href*="/fragments/"], .fragment a';

/**
 * Extracts fragment URLs from image alt attributes in the DOM.
 * @param {Document} dom
 * @returns {string[]}
 */
export function getImageAltFragmentUrls(dom) {
  return [...dom.body.querySelectorAll('img[alt]')]
    .map((img) => {
      const alt = img.getAttribute('alt');
      // Alt fragments are in this format:
      // https://main--bacom--adobecom.hlx.live/fragments/products/modal/videos/adobe-experience-manager/sites/omnichannel-experiences/experience-fragments#xf | Experience Fragment demo video | :play-medium:
      if (alt.includes('/fragments/')) {
        const [href] = alt.split('|');
        if (href?.includes('/fragments/')) {
          return href;
        }
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Extracts all fragment URLs (from anchors and image alts) from HTML text.
 * @param {string} html
 * @returns {string[]} Array of fragment hrefs (strings)
 */
export function getFragmentUrls(html) {
  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');
  const results = dom.body.querySelectorAll(FRAGMENT_SELECTOR);
  const fragmentUrls = [...results].map((a) => a.getAttribute('href'));
  const imgAltUrls = getImageAltFragmentUrls(dom);
  return [...fragmentUrls, ...imgAltUrls];
}

/**
 * Derives the MSM note fields shown for a checked URL.
 * @param {object} params
 * @param {boolean} params.ok - Whether the page was found.
 * @param {boolean} params.inherited - Whether it was read from a source site.
 * @param {string} params.resolvedSite - Site the response came from.
 * @param {{error: string, status?: number}} [params.msmError] - MSM config read failure.
 * @returns {{inheritedFrom?: string, msmError?: object}} Fields to merge onto the URL.
 */
export function getMsmNote({ ok, inherited, resolvedSite, msmError }) {
  if (ok) return { inheritedFrom: inherited ? resolvedSite : undefined, msmError: undefined };
  return { inheritedFrom: undefined, msmError };
}
