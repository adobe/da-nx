const loadStyle = (() => {
  const styles = {};

  return (href, root) => {
    const path = href.endsWith('.js') ? href.replace('.js', '.css') : href;
    if (!styles[path]) {
      styles[path] = new Promise((resolve) => {
        (async () => {
          const resp = await fetch(path);
          const text = await resp.text();
          const style = new CSSStyleSheet();
          style.path = path;
          style.replaceSync(text);
          resolve(style);
        })();
      });
    }

    if (root) {
      styles[path].then((style) => {
        if (root.adoptedStyleSheets.some((sheet) => sheet.path === style.path)) return;
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, style];
      });
    }

    return styles[path];
  };
})();

export default loadStyle;
