/* eslint-disable max-len */
import decorateTable from './decorateTable.js';
import parseQuery from './parseQuery.js';
import { processAltText, resetAltText } from './processAltText.js';

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

function resetHrefs(doc, org, repo) {
  const anchors = doc.querySelectorAll('[href^="/"]');
  anchors.forEach((a) => {
    const href = a.getAttribute('href');
    a.href = `https://main--${repo}--${org}.aem.page${href}`;
  });
}

const addDntWrapper = (node, dntContent) => {
  node.innerHTML = node.innerHTML.replaceAll(dntContent, `<span translate="no" class="dnt-text">${dntContent}</span>`);
};

const findAndAddDntWrapper = (document, dntContent) => {
  const contentMatches = document.evaluate(`//text()[contains(., "${dntContent}")]/..`, document, null, 0, null);
  // eslint-disable-next-line no-underscore-dangle
  contentMatches?._value?.nodes.forEach((node) => {
    addDntWrapper(node, dntContent);
  });
};

const unwrapDntContent = (document) => {
  document.querySelectorAll('.dnt-text').forEach((dntSpan) => {
    const spanParent = dntSpan.parentNode;
    const textBefore = document.createTextNode(dntSpan.textContent);
    const textAfter = document.createTextNode('');

    spanParent.replaceChild(textAfter, dntSpan);
    spanParent.insertBefore(textBefore, textAfter);
    spanParent.normalize();
  });
};

const addDntInfoToHtml = (html, dntRules) => {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');

  makeHrefsRelative(document);

  document.querySelector('header')?.remove();
  document.querySelector('footer')?.remove();

  dntRules.docRules.forEach((rules, block) => {
    const blockEl = document.querySelector(`.${block}`);
    if (!blockEl) return;
    rules.forEach((rule) => {
      decorateTable(blockEl, parseQuery(rule));
    });
  });

  dntRules.contentRules.forEach((dntContent) => {
    findAndAddDntWrapper(document, dntContent);
  });

  processAltText(document, addDntWrapper);
  return document.documentElement.outerHTML;
};

// TODO memoize
function parseConfig(config) {
  const docRules = config['custom-doc-rules']?.data || [];
  const contentRules = config['dnt-content-rules']?.data || [];

  const rules = {
    docRules: new Map(),
    contentRules: [],
  };

  docRules.forEach((rule) => {
    const blockList = rule.block.split(',').map((block) => block.trim());
    blockList.forEach((block) => {
      const blockRules = rules.docRules.get(block) || [];
      blockRules.push(rule.rule);
      rules.docRules.set(block, blockRules);
    });
  });

  contentRules.forEach((contentRule) => {
    rules.contentRules.push(contentRule.content);
  });

  return rules;
}

export async function removeDnt(html, org, repo, { fileType = 'html' } = {}) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');

  unwrapDntContent(document);
  resetAltText(document);
  resetIcons(document);
  resetHrefs(document, org, repo);
  removeDntAttributes(document);
  if (fileType === 'json') {
    const { html2json } = await import('./json2html.js');
    return html2json(document.documentElement.outerHTML);
  }
  return document.documentElement.outerHTML;
}

export async function addDnt(inputText, config, { fileType = 'html' } = {}) {
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
