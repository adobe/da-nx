/* eslint-disable max-len */
import decorateTable from './decorateTable.js';
import parseQuery from './parseQuery.js';

function removeDntAttributes(document) {
  const dntEls = document.querySelectorAll('[translate="no"]');
  dntEls.forEach((el) => { el.removeAttribute('translate'); });
}

function makeHrefsRelative(document) {
  const els = document.querySelectorAll('[href^="https://main--"]');
  els.forEach((el) => {
    const url = new URL(el.href);
    el.href = `${url.pathname}${url.search}${url.hash}`;
  });
}

export function makeIconSpans(html) {
  const iconRegex = /:([a-zA-Z0-9-]+?):/gm;

  if (!iconRegex.test(html)) return html;
  return html.replace(
    iconRegex,
    (_, iconName) => `<span class="icon icon-${iconName}"></span>`,
  );
}

export function resetIcons(doc) {
  const icons = doc.querySelectorAll('span.icon');
  icons.forEach((icon) => {
    const parent = icon.parentElement;
    const iconClass = [...icon.classList].find((cls) => cls.startsWith('icon-'));
    if (!iconClass) return;
    const name = iconClass.split('-').slice(1).join('-');
    const textIcon = doc.createTextNode(`:${name}:`);
    parent.replaceChild(textIcon, icon);
  });
}

const addDntInfoToHtml = (html, dntRules) => {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');

  // TODO should this be done for generic dnt?
  makeHrefsRelative(document);

  // TODO should this be done for generic dnt?
  document.querySelector('header')?.remove();
  document.querySelector('footer')?.remove();

  dntRules.forEach((rules, block) => {
    const blockEl = document.querySelector(`.${block}`);
    if (!blockEl) return;
    rules.forEach((rule) => {
      decorateTable(blockEl, parseQuery(rule));
    });
  });

  return document.documentElement.outerHTML;
};

// TODO memoize
function parseConfig(config) {
  const data = config['custom-doc-rules']?.data || [];
  const rules = new Map();
  data.forEach((rule) => {
    const block = rules.get(rule.block) || [];
    block.push(rule.rule);
    rules.set(rule.block, block);
  });
  return rules;
}

export async function removeDnt(html, org, repo, { fileType = 'html' } = {}) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');
  resetIcons(document);
  removeDntAttributes(document);
  if (fileType === 'json') {
    const { html2json } = await import('./json2html.js');
    return html2json(document.documentElement.outerHTML);
  }
  return document.documentElement.outerHTML;
}

export async function addDnt(inputText, config, { fileType = 'html', reset = false } = {}) {
  let html = inputText;
  const rules = parseConfig(config);

  if (fileType === 'json') {
    const json = JSON.parse(inputText);
    const { json2html } = await import('./json2html.js');
    html = json2html(json, rules);
  }

  if (fileType === 'html') {
    html = makeIconSpans(inputText);
  }
  return addDntInfoToHtml(html, rules);
}
