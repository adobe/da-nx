const cache = {};

// eslint-disable-next-line import/prefer-default-export
export const loadStyle = (supplied) => {
  // Convenience replacement for WCs
  const path = supplied.replace('.js', '.css');

  try {
    cache[path] ??= new Promise((resolve) => {
      (async () => {
        const resp = await fetch(path);
        const text = await resp.text();
        const sheet = new CSSStyleSheet({ baseURL: path });
        sheet.path = path;
        sheet.replaceSync(text);
        resolve(sheet);
      })();
    });
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`Could not load ${path}`);
  }
  return cache[path];
};
