/* eslint-disable import/no-unresolved -- importmap */
import { DOMParser as PMDOMParser, TextSelection } from 'da-y-wrapper';
import { daFetch } from '../../../utils/daFetch.js';

const AEM_ORIGINS = ['hlx.page', 'hlx.live', 'aem.page', 'aem.live'];
const REPLACE_CONTENT = '<content>';

// ---------------------------------------------------------------------------
// Block HTML parsing — ported from da-live helpers/index.js
// ---------------------------------------------------------------------------

function isHeading(el) {
  return ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el?.nodeName);
}

function getBlockName(className) {
  const [name, ...rest] = (className || '').split(' ');
  return { name, variants: rest.length ? rest.join(', ') : undefined };
}

function getBlockTableHtml(block) {
  const { name, variants } = getBlockName(block.className);
  const rows = [...block.children];
  const maxCols = rows.reduce((n, row) => Math.max(n, row.children.length), 0) || 1;

  const table = document.createElement('table');
  table.setAttribute('border', '1');

  const headerRow = document.createElement('tr');
  const th = document.createElement('td');
  th.setAttribute('colspan', String(maxCols));
  th.textContent = variants ? `${name} (${variants})` : name;
  headerRow.append(th);
  table.append(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    [...row.children].forEach((col) => {
      const td = document.createElement('td');
      if (row.children.length < maxCols) td.setAttribute('colspan', String(maxCols));
      td.innerHTML = col.innerHTML;
      tr.append(td);
    });
    table.append(tr);
  });

  return table;
}

function decorateImages(element, path) {
  try {
    const { origin } = new URL(path);
    element.querySelectorAll('img').forEach((img) => {
      if (img.getAttribute('src')?.startsWith('./')) {
        img.src = `${origin}/${img.src.split('/').pop()}`;
      }
      const ratio = img.width > 200 ? 200 / img.width : 1;
      img.width = Math.round(img.width * ratio);
      img.height = Math.round(img.height * ratio);
    });
  } catch { /* leave images as-is */ }
}

async function fetchAndParseHtml(path, isAemHosted) {
  try {
    const resp = await daFetch(`${path}${isAemHosted ? '.plain.html' : ''}`);
    if (!resp.ok) return null;
    return new window.DOMParser().parseFromString(await resp.text(), 'text/html');
  } catch { return null; }
}

function getSectionsAndBlocks(doc) {
  return [...doc.querySelectorAll('body > div, main > div')].reduce((acc, section) => {
    const hr = document.createElement('hr');
    hr.dataset.issection = 'true';
    acc.push(hr, ...section.querySelectorAll(':scope > *'));
    return acc;
  }, []);
}

function processGroupBlock(block) {
  const container = document.createElement('div');
  [...block.children].forEach((child) => {
    container.append(child.tagName === 'DIV' ? getBlockTableHtml(child) : child.cloneNode(true));
  });
  return container;
}

function groupBlocks(elements) {
  return elements.reduce((state, el) => {
    if (el.classList?.contains('library-container-start')) {
      const blockGroup = document.createElement('div');
      blockGroup.dataset.isgroup = 'true';
      const container = document.createElement('div');
      if (isHeading(el.previousElementSibling)) {
        container.append(el.previousElementSibling.cloneNode(true));
      }
      state.currentGroup = { container, blockGroup };
    } else if (el.classList?.contains('library-container-end') && state.currentGroup) {
      const { blockGroup } = state.currentGroup;
      state.blocks.push(blockGroup);
      state.currentGroup = null;
    } else if (state.currentGroup) {
      state.currentGroup.blockGroup.append(el.cloneNode(true));
    } else if (
      el.nodeName === 'DIV'
      && !el.dataset?.issection
      && !el.classList?.contains('library-metadata')
    ) {
      state.blocks.push(el);
    }
    return state;
  }, { blocks: [], currentGroup: null }).blocks;
}

function transformBlock(block) {
  const prevSib = block.previousElementSibling;
  const item = isHeading(prevSib) && prevSib.textContent
    ? { name: prevSib.textContent }
    : getBlockName(block.className || '');
  item.dom = block.dataset?.isgroup ? processGroupBlock(block) : getBlockTableHtml(block);
  return item;
}

export async function getBlockVariants(path) {
  let isAemHosted = false;
  try {
    isAemHosted = AEM_ORIGINS.some((o) => new URL(path).origin.endsWith(o));
  } catch { /* relative path */ }

  const doc = await fetchAndParseHtml(path, isAemHosted);
  if (!doc) return [];

  decorateImages(doc.body, path);
  return groupBlocks(getSectionsAndBlocks(doc)).map(transformBlock);
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export async function fetchBlocks(sources) {
  const blocks = [];
  for (const url of sources) {
    try {
      const resp = await daFetch(url);
      if (resp.ok) {
        const json = await resp.json();
        const data = json?.data ?? (Array.isArray(json) ? json : []);
        data.forEach((row) => {
          if (row.name && row.path) {
            blocks.push({ ...row, loadVariants: getBlockVariants(row.path) });
          }
        });
      }
    } catch { /* skip failed source */ }
  }
  return blocks;
}

export async function fetchItems(sources, format) {
  const items = [];
  for (const source of sources) {
    try {
      const resp = await daFetch(source);
      if (resp.ok) {
        const json = await resp.json();
        const data = json?.data ?? (Array.isArray(json) ? json : []);
        data.forEach((row) => {
          const key = row.key ?? row.name;
          if (!key && !row.value) return;
          const text = format ? format.replace(REPLACE_CONTENT, key ?? '') : (key ?? '');
          items.push({ ...row, key: key ?? '', text });
        });
      }
    } catch { /* skip failed source */ }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Content insertion
// ---------------------------------------------------------------------------

export function insertBlock(view, dom) {
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(dom);
  const { tr, schema } = view.state;
  const insertPos = tr.selection.from;
  let newTr = tr.insert(insertPos, schema.nodes.paragraph.create());
  newTr = newTr.replaceSelectionWith(parsed);
  const finalPos = Math.min(insertPos + parsed.nodeSize, newTr.doc.content.size);
  view.dispatch(newTr.setSelection(TextSelection.create(newTr.doc, finalPos)).scrollIntoView());
}

export function insertText(view, text) {
  const node = view.state.schema.text(text);
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}

export async function insertTemplate(view, url) {
  const resp = await daFetch(url);
  if (!resp.ok) return;
  const html = (await resp.text()).replace('class="template-metadata"', 'class="metadata"');
  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(doc.body);
  view.dispatch(view.state.tr.replaceSelectionWith(parsed).scrollIntoView());
}
