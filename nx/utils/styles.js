const STYLES = {};

export default async function getStyle(href) {
  const path = href.endsWith('.js')
    ? href.replace('.js', '.css') : href;

  if (!STYLES[path]) {
    STYLES[path] = new Promise((resolve) => {
      (async () => {
        const resp = await fetch(path);
        const text = await resp.text();
        const style = new CSSStyleSheet();
        style.replace(text);
        resolve(style);
      })();
    });
  }
  return STYLES[path];
}
