/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const LOG = async (ex, el) => (await import('../utils/error.js')).default(ex, el);

export function getMetadata(name) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = document.head.querySelector(`meta[${attr}="${name}"]`);
  return meta && meta.content;
}

export function getLocale(locales) {
  const key = getMetadata('lang') || localStorage.getItem('lang') || '';
  if (locales[key].lang) document.documentElement.lang = locales[key].lang;
  return { key, ...locales[key] };
}

export const env = (() => {
  const { host } = window.location;
  if (host.endsWith('.aem.live')) return 'prod';
  if (!['--', 'local'].some((check) => host.includes(check))) return 'prod';
  if (['--'].some((check) => host.includes(check))) return 'stage';
  return 'dev';
})();

async function getStrings(locales, locale) {
  const strings = new Map();

  // If not the default lang, load localized strings
  const defaultLang = Object.values(locales)[0].lang;
  if (locale.lang !== defaultLang) {
    const resp = await fetch(`/${locale.lang}/placeholders.json`);
    if (resp.ok) {
      const { data } = await resp.json();
      for (const row of data) {
        strings.set(row.key, row.value);
      }
    }
  }

  return strings;
}

export const [setConfig, getConfig] = (() => {
  let config;
  return [
    async (conf = {}) => {
      const locales = conf.locales || { '': {} };
      const locale = getLocale(locales);
      const strings = await getStrings(locales, locale);
      const nxBase = `${import.meta.url.replace('/scripts/nx.js', '')}`;

      config = {
        ...conf,
        env: conf.env || env,
        iconSize: conf.iconSize || '20',
        linkBlocks: conf.linkBlocks || [{ fragment: '/fragments/' }],
        providers: conf.providers || {},
        codeBase: conf.codeBase || nxBase,
        log: conf.log || LOG,
        locales,
        locale,
        strings,
        nxBase,
      };
      return config;
    },
    () => (config || { error: 'Config not set, yet.' }),
  ];
})();

export const loc = ([first], ...values) => {
  const key = values.length ? values[0] : first;
  const { strings } = getConfig();
  return strings.get(key) ?? key;
};

export async function loadBlock(block) {
  const { providers, nxBase, log } = getConfig();
  const { classList } = block;
  const name = classList[0];
  const [ns, ...rest] = name.split('-');
  const base = providers[ns] || nxBase;
  const basedName = base === nxBase ? name : rest.join('-');
  block.dataset.blockName = name;
  const blockPath = `${base}/blocks/${basedName}/${basedName}`;
  try {
    await (await import(`${blockPath}.js`)).default(block);
  } catch (ex) {
    log(ex, block);
  }
  return block;
}

function decoratePictures(el) {
  const pics = el.querySelectorAll('picture');
  for (const pic of pics) {
    const source = pic.querySelector('source');
    const clone = source.cloneNode();
    const [pathname, params] = clone.getAttribute('srcset').split('?');
    const search = new URLSearchParams(params);
    search.set('width', 3000);
    clone.setAttribute('srcset', `${pathname}?${search.toString()}`);
    clone.setAttribute('media', '(min-width: 1440px)');
    pic.prepend(clone);
  }
}

function decorateHash(a, url) {
  const { hash } = url;
  if (!hash || hash === '#') return {};

  const findHash = (name) => {
    const found = hash.includes(name);
    if (found) a.href = a.href.replace(name, '');
    return found;
  };

  const blank = findHash('#_blank');
  if (blank) a.target = '_blank';

  const dnt = findHash('#_dnt');
  const dnb = findHash('#_dnb');
  return { dnt, dnb };
}

export function decorateLink(config, a) {
  try {
    const url = new URL(a.href);
    const hostMatch = config.hostnames.some((host) => url.hostname === host);
    if (hostMatch) a.href = a.href.replace(url.origin, '');

    const { dnb } = decorateHash(a, url);
    if (!dnb) {
      const { pathname, hash } = a;
      const found = config.linkBlocks.some((pattern) => {
        const key = Object.keys(pattern)[0];
        if (!pathname.includes(pattern[key])) return false;
        const blockName = key === 'fragment' && hash ? 'dialog' : key;
        a.classList.add(blockName, 'auto-block');
        return true;
      });
      if (found) return a;
    }
  } catch (ex) {
    config.log('Could not decorate link', ex);
  }
  return null;
}

function decorateLinks(el) {
  const config = getConfig();
  const anchors = [...el.querySelectorAll('a')];
  return anchors.reduce((acc, a) => {
    const decorated = decorateLink(config, a);
    if (decorated) acc.push(decorated);
    return acc;
  }, []);
}

function loadIcons(el) {
  const icons = el.querySelectorAll('span.icon');
  if (!icons.length) return;
  import('../utils/svg.js').then((mod) => mod.default({ icons }));
}

function groupChildren(section) {
  const children = section.querySelectorAll(':scope > *');
  const groups = [];
  let currentGroup = null;
  for (const child of children) {
    const isDiv = child.tagName === 'DIV';
    const currentType = currentGroup?.classList.contains('block-content');

    if (!currentGroup || currentType !== isDiv) {
      currentGroup = document.createElement('div');
      currentGroup.className = isDiv
        ? 'block-content' : 'default-content';
      groups.push(currentGroup);
    }

    currentGroup.append(child);
  }
  return groups;
}

function decorateSections(parent, isDoc) {
  const selector = isDoc ? 'main > div' : ':scope > div';
  return [...parent.querySelectorAll(selector)].map((section) => {
    const groups = groupChildren(section);
    section.append(...groups);
    section.classList.add('section');
    section.dataset.status = 'decorated';
    section.linkBlocks = decorateLinks(section);
    section.blocks = [...section.querySelectorAll('.block-content > div[class]')];
    return section;
  });
}

function decorateNav() {
  const header = document.querySelector('header');
  if (!header) return;
  const meta = getMetadata('header');
  if (meta === 'off') {
    header.remove();
    return;
  }
  const nxNav = document.createElement('nx-nav');
  header.append(nxNav);
  // Sidenav for app frame
  const appFrame = getMetadata('template') === 'app-frame';
  if (!appFrame) return;
  const snmeta = getMetadata('sidenav');
  if (snmeta === 'off') return;
  const nav = document.createElement('nav');
  const nxSidenav = document.createElement('nx-sidenav');
  nav.append(nxSidenav);
  header.after(nav);
}

async function decoratePlaceholders(area, isDoc) {
  const parent = isDoc ? area.body : area;

  const { SHOW_TEXT, FILTER_ACCEPT, FILTER_REJECT } = NodeFilter;
  const opts = {
    acceptNode: (node) => (node.textContent.includes('{') ? FILTER_ACCEPT : FILTER_REJECT),
  };
  const walker = document.createTreeWalker(parent, SHOW_TEXT, opts);

  while (walker.nextNode()) {
    const { currentNode } = walker;
    const fn = (_, key) => loc`${key}`;
    currentNode.textContent = currentNode.textContent.replace(/\{([^}]+)\}/g, fn);
  }
}

function loadSession() {
  sessionStorage.setItem('session', true);
  document.body.classList.add('session');
}

async function decorateDoc() {
  // Fast track IMS if returning from sign in
  if (window.location.hash.startsWith('#old_hash')) {
    const { loadIms } = await import('../utils/ims.js');
    await loadIms();
  }

  decorateNav();

  const template = getMetadata('template');
  if (template) document.body.classList.add(template);

  const scheme = localStorage.getItem('color-scheme');
  if (scheme) document.body.classList.add(scheme);

  const pageId = window.location.hash?.replace('#', '');
  if (pageId) localStorage.setItem('lazyhash', pageId);

  if (localStorage.getItem('nx-panels')) {
    const { restorePanels } = await import('../utils/panel.js');
    await restorePanels();
  }
}

export async function loadArea({ area } = { area: document }) {
  const isDoc = area === document;
  const isSession = sessionStorage.getItem('session');
  if (isDoc) await decorateDoc();
  await decoratePlaceholders(area, isDoc);
  decoratePictures(area);
  const { decorateArea } = getConfig();
  if (decorateArea) decorateArea({ area });
  if (isDoc && isSession) loadSession();
  const sections = decorateSections(area, isDoc);
  for (const [idx, section] of sections.entries()) {
    loadIcons(section);
    await Promise.all(section.linkBlocks.map((block) => loadBlock(block)));
    await Promise.all(section.blocks.map((block) => loadBlock(block)));
    delete section.dataset.status;
    if (isDoc && idx === 0) {
      const header = document.querySelector('nx-nav');
      if (!header) return;
      import('../blocks/nav/nav.js');
      const appFrame = document.body.classList.contains('app-frame');
      if (!appFrame) return;
      const sidenav = document.querySelector('nx-sidenav');
      if (sidenav) import('../blocks/sidenav/sidenav.js');

      if (!isSession) loadSession();
      import('../utils/favicon.js');
    }
  }
}
