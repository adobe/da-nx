const DEF_CONFIG = {};

export const [setConfig, getConfig] = (() => {
  let config;
  return [
    (conf = DEF_CONFIG) => {
      config = conf;
      return config;
    },
    () => config,
  ];
})();

export function getMetadata(name, doc = document) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = doc.head.querySelector(`meta[${attr}="${name}"]`);
  return meta && meta.content;
}

async function loadStyle(href) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    } else {
      resolve();
    }
  });
}

async function loadBlock(block) {
  const { classList } = block;
  const name = classList[0];
  block.dataset.name = name;
  const { origin } = new URL(import.meta.url);
  const path = name.startsWith('nx') ? `${origin}/nx/blocks` : `${getConfig().codeRoot || ''}/blocks`;
  const blockPath = `${path}/${name}/${name}`;

  const scriptLoaded = new Promise((resolve) => {
    (async () => {
      try {
        const { default: init } = await import(`${blockPath}.js`);
        await init(block);
      } catch (err) {
        console.log(`Failed loading ${name}`, err);
      }
      resolve();
    })();
  });
  const loaded = [scriptLoaded];
  if (!block.classList.contains('cmp')) {
    loaded.push(loadStyle(`${blockPath}.css`));
  }
  await Promise.all(loaded);
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

function decorateSection(section) {
  section.className = 'section';
  section.dataset.status = 'decorated';
  const blocks = [...section.querySelectorAll(':scope > div[class]')];
  decorateDefaults(section);
  return { blocks, el: section };
}

function decorateSections(el, isDoc) {
  const selector = isDoc ? 'body > main > div' : ':scope > div';
  return [...el.querySelectorAll(selector)].map(decorateSection);
}

function decorateHeader() {
  const header = document.querySelector('header');
  if (!header) return;
  const meta = getMetadata('header');
  if (meta === 'off') {
    document.body.classList.add('header-off');
    header.remove();
    return;
  }
  header.className = meta || 'nx-nav cmp';
  header.dataset.status = 'decorated';
}

async function loadPostLCP() {
  const header = document.querySelector('header');
  if (header) await loadBlock(header);
}

export async function loadArea(area = document) {
  const config = getConfig() || setConfig();
  const isDoc = area === document;
  if (isDoc) decorateHeader();
  const sections = decorateSections(area, isDoc);
  for (const [idx, section] of sections.entries()) {
    const loaded = section.blocks.map((block) => loadBlock(block));
    await Promise.all(loaded);
    delete section.el.dataset.status;
    if (isDoc && idx === 0) await loadPostLCP();
  }
}
