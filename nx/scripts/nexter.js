const AUTO_BLOCKS = [
  { 'nx-fragment': '/fragments/' },
  { 'nx-youtube': 'https://www.youtube.com' },
];

function getEnv() {
  const { host } = new URL(window.location.href);
  if (!['.page', 'local'].some((check) => host.includes(check))) return 'prod';
  if (host.includes('.hlx.') || host.includes('.aem.')) return 'stage';
  return 'dev';
}

export const [setConfig, getConfig] = (() => {
  let config;
  return [
    (conf = {}) => {
      config = {
        ...conf,
        env: getEnv(),
        nxBase: `${import.meta.url.replace('/scripts/nexter.js', '')}`,
      };
      return config;
    },
    () => (config || setConfig()),
  ];
})();

export function getMetadata(name, doc = document) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = doc.head.querySelector(`meta[${attr}="${name}"]`);
  return meta && meta.content;
}

export const loadStyle = (() => {
  const styles = {};

  return (path, root) => {
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

export async function loadBlock(block) {
  const { classList } = block;
  let name = classList[0];
  const isNx = name.startsWith('nx-');
  const isCmp = classList.contains('cmp');
  if (isNx) name = name.replace('nx-', '');
  block.dataset.blockName = name;
  const { nxBase, env, codeBase = '' } = getConfig();
  console.log(env);
  const path = isNx ? `${nxBase}/blocks` : `${codeBase}/blocks`;
  const blockPath = `${path}/${name}/${name}`;
  const styleLoaded = loadStyle(`${blockPath}.css`, isCmp ? null : document);
  const scriptLoaded = new Promise((resolve) => {
    (async () => {
      try {
        await (await import(`${blockPath}.js`)).default(block);
      } catch { console.log(`Failed loading: ${name}`); }
      resolve();
    })();
  });
  await Promise.all([styleLoaded, scriptLoaded]);
  return block;
}

function decorateContent(el) {
  const children = [el];
  let child = el;
  while (child) {
    child = child.nextElementSibling;
    if (child && child.nodeName !== 'DIV') {
      children.push(child);
    } else {
      break;
    }
  }
  const block = document.createElement('div');
  block.className = 'content';
  block.append(...children);
  return block;
}

function decorateDefaults(el) {
  const firstChild = ':scope > *:not(div):first-child';
  const afterBlock = ':scope > div + *:not(div)';
  const children = el.querySelectorAll(`${firstChild}, ${afterBlock}`);
  children.forEach((child) => {
    const prev = child.previousElementSibling;
    const content = decorateContent(child);
    if (prev) {
      prev.insertAdjacentElement('afterend', content);
    } else {
      el.insertAdjacentElement('afterbegin', content);
    }
  });
}

function decorateLinks(el) {
  const anchors = [...el.querySelectorAll('a')];
  return anchors.reduce((acc, a) => {
    const { href } = a;
    const found = AUTO_BLOCKS.some((pattern) => {
      const key = Object.keys(pattern)[0];
      if (!href.includes(pattern[key])) return false;
      a.classList.add(key, 'auto-block');
      return true;
    });
    if (found) acc.push(a);
    return acc;
  }, []);
}

function decorateSection(el) {
  el.classList.add('section');
  el.dataset.status = 'decorated';
  el.autoBlocks = decorateLinks(el);
  el.blocks = [...el.querySelectorAll(':scope > div[class]')];
  decorateDefaults(el);
  return el;
}

function decorateSections(el, isDoc) {
  const selector = isDoc ? 'main > div' : ':scope > div';
  return [...el.querySelectorAll(selector)].map(decorateSection);
}

function decorateHeader() {
  const header = document.querySelector('header');
  if (!header) return;
  const meta = getMetadata('header') || 'nx-nav cmp';
  if (meta === 'off') {
    header.remove();
    return;
  }
  header.dataset.status = 'decorated';
  header.className = meta;
  if (header.classList.contains('nx-nav')) {
    document.body.classList.add('nx-app');
  }
}

export async function loadArea(area = document) {
  const isDoc = area === document;
  if (isDoc) {
    if (getMetadata('signin')) await import('../utils/signin.js');
    document.documentElement.lang = 'en';
    decorateHeader();
  }
  const sections = decorateSections(area, isDoc);
  for (const [idx, section] of sections.entries()) {
    await Promise.all(section.autoBlocks.map((block) => loadBlock(block)));
    await Promise.all(section.blocks.map((block) => loadBlock(block)));
    delete section.dataset.status;
    if (isDoc && idx === 0) await import('./postlcp.js');
  }
  if (isDoc) import('./lazy.js');
}
