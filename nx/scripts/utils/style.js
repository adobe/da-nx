export const loadStyle = (() => {
  const cache = {};

  return (supplied) => {
    const path = supplied.replace('.js', '.css');
    cache[path] ??= import(path, { with: { type: 'css' } })
      .then(({ default: sheet }) => sheet);
    return cache[path];
  };
})();
