/**
 * Fills a delivery-URL template by substituting `${aemPath}` and collapsing any
 * accidental duplicate slashes the substitution introduces.
 * @param {string} template  URL template, may contain `${aemPath}`.
 * @param {string} aemPath   Lowercased `/org/site/path` (carries a leading slash).
 * @returns {string}
 */
export function applyUrlTemplate(template, aemPath) {
  // eslint-disable-next-line no-template-curly-in-string
  const url = template.replace('${aemPath}', aemPath);
  // aemPath carries a leading slash, so a template like `.../preview/${aemPath}`
  // yields `preview//...`; collapse duplicate slashes but keep the `://` scheme.
  return url.replace(/([^:])\/{2,}/g, '$1/');
}
