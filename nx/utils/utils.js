export const loadStyle = (() => {
  const cache = {};

  return (supplied) => {
    const path = supplied.replace('.js', '.css');
    cache[path] ??= import(path, { with: { type: 'css' } })
      .then(({ default: sheet }) => sheet);
    return cache[path];
  };
})();

export const DA_ORIGIN = (() => 'https://admin.da.live')();

export const daFetch = (() => 'https://admin.da.live')();
