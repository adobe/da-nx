export function isDocumentResource(details) {
  const fullpath = (details?.fullpath ?? '').trim();
  if (fullpath.toLowerCase().endsWith('.html')) return true;

  const sourceUrl = details?.sourceUrl;
  if (!sourceUrl || typeof sourceUrl !== 'string') return false;

  try {
    const { pathname } = new URL(sourceUrl);
    return pathname.toLowerCase().endsWith('.html');
  } catch {
    return false;
  }
}

export function getDisplayPath(details) {
  const fullpath = (details?.fullpath ?? '').trim();
  return fullpath.toLowerCase().endsWith('.html')
    ? fullpath.slice(0, -5)
    : fullpath;
}
