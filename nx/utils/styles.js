const STYLES = {};

export default async function getStyle(href) {
  const path = href.replace('.js', '.css');
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
