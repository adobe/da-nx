import decorateTable from './decorateTable.js';
import parseQuery from './parseQuery.js';
import { processAltText, resetAltText } from './processAltText.js';

const DNT_ELEMENTS = ['code', 'body > .da-metadata'];

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
  // Regex that matches :icon: but not when inside alt text double-quoted string
  const iconRegex = /(?<!alt="[^"]*)(?<!src="[^"]*)(?<!srcset="[^"]*)(?<!href="[^"]*):([a-zA-Z0-9-]+?):/gm;

  if (!iconRegex.test(html)) return html;

  const result = html.replace(
    iconRegex,
    (_, iconName) => `<span class="icon icon-${iconName}"></span>`,
  );
  // Remove any whitespace after </span>
  return result.replace(/<\/span>\s+/g, '</span>');
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

const addDntWrapper = (root, dntContent) => {
  if (!dntContent) return;

  const document = root.ownerDocument || root;
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
    if (
      textNode.nodeValue.includes(dntContent)
      && !textNode.parentElement?.closest('[translate="no"]')
    ) {
      textNodes.push(textNode);
    }
  }

  textNodes.forEach((textNode) => {
    const parts = textNode.nodeValue.split(dntContent);
    const fragment = document.createDocumentFragment();

    parts.forEach((part, index) => {
      if (part) fragment.append(document.createTextNode(part));
      if (index < parts.length - 1) {
        const wrapper = document.createElement('span');
        wrapper.classList.add('dnt-text');
        wrapper.setAttribute('translate', 'no');
        wrapper.textContent = dntContent;
        fragment.append(wrapper);
      }
    });

    textNode.replaceWith(fragment);
  });
};

const findAndAddDntWrapper = (document, dntContent) => {
  addDntWrapper(document, dntContent);
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
    const blockEls = document.querySelectorAll(`.${block}`);
    if (!blockEls.length) return;

    blockEls.forEach((blockEl) => {
      rules.forEach((rule) => {
        decorateTable(blockEl, parseQuery(rule));
      });
    });
  });

  dntRules.contentRules.forEach((dntContent) => {
    findAndAddDntWrapper(document, dntContent);
  });

  DNT_ELEMENTS.forEach((dntElement) => {
    document.querySelectorAll(dntElement).forEach((el) => {
      el.setAttribute('translate', 'no');
    });
  });

  processAltText(document, addDntWrapper);
  return document.documentElement.outerHTML;
};

const extractPattern = (rule) => {
  const { pattern } = rule;
  let condition = 'exists';
  let match = '*';
  if (pattern && pattern.length > 0) {
    if (pattern !== '*' && pattern.includes('(') && pattern.includes(')')) {
      condition = pattern.substring(0, pattern.indexOf('(')).trim();
      match = (pattern.substring(pattern.indexOf('(') + 1, pattern.indexOf(')')).split('||')).map((item) => item.trim().toLowerCase());
    }
  }
  return { condition, match };
};

function parseConfig(config) {
  const docRules = config['custom-doc-rules']?.data || [];
  const contentRules = config['dnt-content-rules']?.data || [];
  const sheetRules = config['dnt-sheet-rules']?.data || [];
  const dntSheetData = config.dnt?.data || [];

  const rules = {
    docRules: new Map(),
    contentRules: [],
    sheetRules: [],
    dntSheets: [],
    dntSheetToColumns: new Map(),
    dntUniversalColumns: [],
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

  sheetRules.forEach((sheetRule) => {
    if (Object.keys(sheetRule).length > 0) {
      rules.sheetRules.push(extractPattern(sheetRule));
    }
  });

  dntSheetData.forEach((row) => {
    const dntSheet = row['dnt-sheet'];
    const dntColumnsStr = row['dnt-columns'];
    if (dntColumnsStr === '*') {
      rules.dntSheets.push(dntSheet);
    } else {
      const dntColumns = dntColumnsStr.split(',').map((col) => col.trim());
      if (dntSheet === '*') {
        rules.dntUniversalColumns.push(...dntColumns);
      } else {
        rules.dntSheetToColumns.set(dntSheet, dntColumns);
      }
    }
  });

  return rules;
}

export async function removeDnt({ org, site, html, ext = 'html' }) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');

  unwrapDntContent(document);
  resetAltText(document);
  resetIcons(document);
  resetHrefs(document, org, site);
  removeDntAttributes(document);
  if (ext === 'json') {
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
