/**
 * Normalize URLs to their base path without any language prefix
 *
 * @param {URL} urls the URLs to normalize
 * @param {Array} langs the languages to check URLs against
 * @returns {Array} contextualized urls
 */
export default function normalizeUrls(urls, langs) {
  const fullLangs = langs.filter((lang) => lang.location !== '/');

  return urls.map((url) => {
    const urlLang = fullLangs.find((lang) => {
      if (url.extPath.startsWith(`${lang.location}/`)) return true;
      if (url.extPath === `${lang.location}.html`) return true;
      if (url.extPath === `${lang.location}.json`) return true;
      return false;
    });
    const basePath = urlLang ? url.extPath.replace(urlLang.location, '') : url.extPath;
    return {
      extPath: url.extPath,
      basePath,
    };
  });
}
