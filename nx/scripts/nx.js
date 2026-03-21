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

export function getLocale(locales = { '': {} }) {
  const key = getMetadata('lang') || localStorage.getItem('lang') || '';
  if (locales[key].lang) document.documentElement.lang = locales[key].lang;
  return { key, ...locales[key] };
}

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
      const locale = getLocale(conf.locales);
      const strings = await getStrings(conf.locales, locale);

      config = {
        ...conf,
        iconSize: conf.iconSize || '20',
        linkBlocks: conf.linkBlocks || [],
        log: conf.log || LOG,
        locale,
        strings,
        codeBase: `${import.meta.url.replace('/scripts/nx.js', '')}`,
      };
      return config;
    },
    () => (config || setConfig()),
  ];
})();

export const loc = ([first], ...values) => {
  const key = values.length ? values[0] : first;
  const { strings } = getConfig();
  return strings.get(key) ?? key;
};

export async function loadBlock(block) {
  const { codeBase, log } = getConfig();
  const { classList } = block;
  const name = classList[0];
  block.dataset.blockName = name;
  const blockPath = `${codeBase}/blocks/${name}/${name}`;
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
    const hostMatch = config.hostnames.some((host) => url.hostname.endsWith(host));
    if (hostMatch) a.href = a.href.replace(url.origin, '');

    const { dnb } = decorateHash(a, url);
    if (!dnb) {
      const { href, hash } = a;
      const found = config.linkBlocks.some((pattern) => {
        const key = Object.keys(pattern)[0];
        if (!href.includes(pattern[key])) return false;
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
  import('../utils/icons.js').then((mod) => mod.default(icons));
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

function decorateHeader() {
  const header = document.querySelector('header');
  if (!header) return;
  const meta = getMetadata('header') || 'header';
  if (meta === 'off') {
    document.body.classList.add('no-header');
    header.remove();
    return;
  }
  header.className = meta;
  header.dataset.status = 'decorated';
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

function decorateDoc() {
  decorateHeader();

  const scheme = localStorage.getItem('color-scheme');
  if (scheme) document.body.classList.add(scheme);

  const pageId = window.location.hash?.replace('#', '');
  if (pageId) localStorage.setItem('lazyhash', pageId);
}

export async function loadArea({ area } = { area: document }) {
  const isDoc = area === document;
  if (isDoc) decorateDoc();
  await decoratePlaceholders(area, isDoc);
  decoratePictures(area);
  const { decorateArea } = getConfig();
  if (decorateArea) decorateArea({ area });
  const sections = decorateSections(area, isDoc);
  for (const [idx, section] of sections.entries()) {
    loadIcons(section);
    await Promise.all(section.linkBlocks.map((block) => loadBlock(block)));
    await Promise.all(section.blocks.map((block) => loadBlock(block)));
    delete section.dataset.status;
    if (isDoc && idx === 0) {
      // Post LCP
      const header = document.querySelector('header');
      if (header) await loadBlock(header);
    }
  }
  if (isDoc) import('./lazy.js');
}
