/**
 * Build breadcrumb entries from a hash path segment list (`org`, `site`, …folders).
 * Parent links use `#/` + segments; the first segment alone is never linked — use
 * `#/org/site` so browse always has org + site (see `contextToPathContext`).
 *
 * @param {string[] | undefined | null} pathSegments
 * @returns {{ label: string, href?: string }[]}
 */
export function pathSegmentsToCrumbs(pathSegments) {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    return [];
  }
  const n = pathSegments.length;
  return pathSegments.map((label, i) => {
    if (i === n - 1) {
      return { label };
    }
    const href = i === 0
      ? `#/${pathSegments[0]}/${pathSegments[1]}`
      : `#/${pathSegments.slice(0, i + 1).join('/')}`;
    return { label, href };
  });
}
