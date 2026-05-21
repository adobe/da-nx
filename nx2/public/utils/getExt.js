// eslint-disable-next-line import/prefer-default-export
export function getExt(pathname) {
  const path = pathname.endsWith('/') ? `${pathname}index` : pathname;
  const split = path.split('/').pop().split('.');
  if (split.length === 1) return false;
  return split.pop();
}
