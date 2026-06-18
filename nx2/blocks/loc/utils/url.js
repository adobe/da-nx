function getExtPath(path) {
  const name = path.split('/').pop();
  const split = name.split('.');
  return split.length > 1 ? { path, ext: split.pop() } : { path: `${path}.html`, ext: 'html' };
}

/**
 * Get base path
 *
 * Used to de-regionalize a path
 * @param config The path config.
 * @param config.prefix The prefix to check the path for.
 * @param config.path An AEM-formatted (no org, site, index, no .html) path to de-region.
 */
export function getBasePath({ prefix, path }) {
  if (!prefix) return path;
  return path.startsWith(prefix) ? path.replace(prefix, '') : path;
}

/**
 * Convert a path to DA and AEM formatted w/ optional language prefix
 * @param config The path config.
 * @param config.prefix The prefix to check the path for.
 * @param config.path An AEM-formatted (no org, site, index, no .html) path to de-region.
 */
export function convertPath({ path, destPrefix }) {
  const prefix = destPrefix === '/' || !destPrefix ? '' : destPrefix;

  const plainBasePath = getBasePath({ prefix, path });

  // Determine if we need to add index
  const basePath = plainBasePath.endsWith('/') ? `${plainBasePath}index` : plainBasePath;

  // Get the extension base path (for ubse with DA API)
  // We use ext to determine things like conflict behavior
  const { path: extBasePath, ext } = getExtPath(basePath);

  const daPath = `${prefix}${extBasePath}`;

  const aemPath = `${prefix}${basePath}`;

  return { basePath, extBasePath, daPath, aemPath, ext };
}
