const STYLES = {};

export default async function getStyle(href) {
  const path = href.replace('.js', '.css');
  if (STYLES[path]) return STYLES[path];
  const resp = await fetch(path);
  const text = await resp.text();
  const style = new CSSStyleSheet();
  style.replace(text);
  STYLES[path] = style;
  return style;
}
