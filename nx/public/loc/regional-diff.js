import { hashContent, HASH_LENGTH } from './hashes.js';

const MIN_LIST_ITEMS_IN_COMMON = 2;
const ADDED = 'added';
const ADDED_TAG = 'da-diff-added';
const DELETED = 'deleted';
const DELETED_TAG = 'da-diff-deleted';
const SAME = 'same';

const HLX_AEM_URL_REGEX = /\.hlx\.page\/|\.hlx\.live\/|\.aem\.page\//g;

const sectionBlock = {
  isSection: true,
  outerHTML: 'spoofedSectionHtml',
};

const isList = (block) => ['OL', 'UL'].includes(block.nodeName);

const findConfigValue = (json, key) => {
  const foundRow = json?.config?.data.find((row) => row.key === key);
  return foundRow?.value;
};

/**
 * Recursively trims whitespace in all text nodes of a DOM element.
 * @param {Node} node
 */
function trimTextNodes(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = node.textContent.trim();
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    node.childNodes.forEach(trimTextNodes);
  }
}

/**
 * Recursively serializes an element and its children,
 * sorting all attributes alphabetically for every element.
 * Escapes attribute values and text nodes for HTML safety.
 * Handles element, text, and comment nodes.
 * @param {Element} element - The DOM element to serialize.
 * @returns {string} - The HTML string with sorted attributes for all elements.
 */
function getOuterHTMLWithSortedAttributes(element) {
  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const tagName = element.tagName.toLowerCase();
  const attrs = Array.from(element.attributes)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((attr) => `${attr.name}="${escapeHTML(attr.value)}"`)
    .join(' ');
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);
  if (voidElements.has(tagName)) {
    return `<${tagName}${attrs ? ` ${attrs}` : ''}>`;
  }
  let inner = '';
  for (const child of element.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      inner += getOuterHTMLWithSortedAttributes(child);
    } else if (child.nodeType === Node.TEXT_NODE) {
      inner += escapeHTML(child.textContent);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      // Sanitize comment content to avoid '-->'
      inner += `<!--${child.textContent.replace(/-->/g, '--&gt;')}-->`;
    }
  }
  return `<${tagName}${attrs ? ` ${attrs}` : ''}>${inner}</${tagName}>`;
}

/**
 * Normalizes HTML by trimming whitespace in text nodes and removing whitespace between tags.
 * @param {Element} element - DOM element to normalize
 * @returns {string} - Normalized HTML string
 */
function normalizeHTMLFromElement(element) {
  if (element.outerHTML === 'spoofedSectionHtml') {
    return element.outerHTML;
  }
  // Clone to avoid mutating the original
  const clone = element.cloneNode(true);
  trimTextNodes(clone);
  // Remove whitespace between tags
  let html = getOuterHTMLWithSortedAttributes(clone).replace(/>\s+</g, '><');
  // Remove all line breaks and tabs
  html = html.replace(/[\n\r\t]/g, '');
  // Optionally, collapse multiple spaces
  html = html.replace(/\s{2,}/g, ' ');
  return html.trim();
}

export async function normalizeLinks(doc, site, equivalentSites) {
  // convert all urls with .hlx.page, .hlx.live, .aem.page, .aem.live to .aem.live
  const links = doc.querySelectorAll('a[href*=".hlx.page/"], a[href*=".hlx.live/"], a[href*=".aem.page/"], a[href*=".aem.live/"], source[srcset*=".hlx.page/"], source[srcset*=".hlx.live/"], source[srcset*=".aem.page/"], source[srcset*=".aem.live/"], img[src*=".hlx.page/"], img[src*=".hlx.live/"], img[src*=".aem.page/"], img[src*=".aem.live/"]');
  const tagToAttr = { A: 'href', IMG: 'src', SOURCE: 'srcset' };
  links.forEach((el) => {
    const urlAttr = tagToAttr[el.tagName];
    if (!urlAttr) return;
    let url = el[urlAttr];
    url = url.replace(HLX_AEM_URL_REGEX, '.aem.live/');
    const linkSite = url.split('--')[1];
    if (equivalentSites.has(linkSite)) {
      url = url.replace(`--${linkSite}--`, `--${site}--`);
    }
    el[urlAttr] = url;
  });
  return doc;
}

function getLists(result) {
  const addedLists = [];
  const deletedLists = [];
  result.forEach((item) => {
    if (item.type === ADDED && isList(item.block)) {
      addedLists.push(item);
    }
    if (item.type === DELETED && isList(item.block)) {
      deletedLists.push(item);
    }
  });
  return [addedLists, deletedLists];
}

function getListHashes(list) {
  return [...list.children].map((child) => {
    child.hash = hashContent(child.outerHTML);
    return child.hash;
  });
}

const listElToBlockMap = (listItems) => [...listItems].map((item) => ({
  hash: item.hash,
  block: item,
}));

function wrapContentWithElement(targetElement, wrapperElementTag) {
  const wrapperElement = document.createElement(wrapperElementTag);
  while (targetElement.firstChild) {
    wrapperElement.appendChild(targetElement.firstChild);
  }
  targetElement.appendChild(wrapperElement);
}

const convertToHtmlList = (mergedList) => mergedList
  .map((item) => {
    if (item.type === ADDED) {
      // LI's have the inner content wrapped, unlike other els that are wrapped outside
      wrapContentWithElement(item.block, ADDED_TAG);
    } else if (item.type === DELETED) {
      wrapContentWithElement(item.block, DELETED_TAG);
    }
    return item.block.outerHTML;
  }).join('');

function checkLists(res) {
  let result = res;
  const [addedLists, deletedLists] = getLists(result);
  // see if any of the added lists children match with any deleted list children
  addedLists.forEach((addedList) => {
    const addedItemHashes = getListHashes(addedList.block);
    deletedLists.forEach((deletedList) => {
      if (addedList.block.nodeName !== deletedList.block.nodeName) {
        return;
      }
      const deletedItemHashes = getListHashes(deletedList.block);
      const commonHashes = addedItemHashes.filter((hash) => deletedItemHashes.includes(hash));

      if (commonHashes.length >= MIN_LIST_ITEMS_IN_COMMON) {
        // lists have 2+ common listItems, so we assume that the langstore list has been modified

        // remove the deleted list
        result = result.filter((item) => item.hash !== deletedList.hash);

        const addedListItems = listElToBlockMap(addedList.block.children);
        const deletedListItems = listElToBlockMap(deletedList.block.children);

        // eslint-disable-next-line no-use-before-define
        const mergedList = blockDiff(deletedListItems, addedListItems, { isListCheck: true });
        addedList.block.innerHTML = convertToHtmlList(mergedList);
        addedList.type = SAME;
      }
    });
  });
  return result;
}

const isDeletedItem = (item) => item.type === DELETED;

// When two section breaks are matched, keep the deleted blocks in the section they came from
function pairSectionBreak(result, i, deletedFirst) {
  const before = result.slice(0, i);
  const between = result.slice(i + 1);
  const deleted = between.filter(isDeletedItem);
  const others = between.filter((item) => !isDeletedItem(item));
  const pairedBreak = { ...result[i], type: SAME };
  return deletedFirst
    ? [...before, ...others, pairedBreak, ...deleted]
    : [...before, ...deleted, pairedBreak, ...others];
}

function addToResult(result, newItem, type) {
  for (let i = 0; i < result.length; i += 1) {
    const resultItem = result[i];
    if (resultItem.hash !== newItem.hash || resultItem.type === SAME) {
      // eslint-disable-next-line no-continue
      continue;
    }
    if (newItem.sectionNumber && type !== SAME && resultItem.type !== type) {
      return pairSectionBreak(result, i, resultItem.type === DELETED);
    }
    if (resultItem.type === DELETED) {
      if (type === ADDED) {
        // remove the deleted item from the result, since it was moved
        return [...result.slice(0, i), ...result.slice(i + 1), { ...newItem, type: SAME }];
      }
      if (type === DELETED) {
        // item was deleted in both arrays
        return [...result, { ...newItem, type: DELETED }];
      }
    }
    if (resultItem.type === ADDED) {
      if (type === ADDED) {
        // item was added in both arrays
        return [...result, { ...newItem, type: ADDED }];
      }
      if (type === DELETED) {
        resultItem.type = SAME;
        return result;
      }
    }
  }
  result.push({ ...newItem, type });
  return result;
}

function blockDiff(A, B, { isListCheck = false } = {}) {
  let result = [];
  const length = Math.min(A.length, B.length);
  let i = 0;
  for (i; i < length; i += 1) {
    if (A[i].hash === B[i].hash) {
      result = addToResult(result, A[i], SAME);
    } else {
      result = addToResult(result, A[i], DELETED);
      result = addToResult(result, B[i], ADDED);
    }
  }

  // Add any remaining items
  if (i < A.length) {
    for (; i < A.length; i += 1) {
      result = addToResult(result, A[i], DELETED);
    }
  }
  if (i < B.length) {
    for (; i < B.length; i += 1) {
      result = addToResult(result, B[i], ADDED);
    }
  }

  if (!isListCheck) {
    result = checkLists(result);
  }

  return result;
}

function groupBlocks(blocks) {
  const { groupedBlocks, currentGroup } = blocks.reduce((acc, block) => {
    if (block.className?.toLowerCase().startsWith('block-group-start')) {
      acc.isGrouping = true;
      acc.currentGroup.push(block);
    } else if (block.className?.toLowerCase().startsWith('block-group-end')) {
      acc.currentGroup.push(block);
      acc.groupedBlocks.push(acc.currentGroup);
      acc.currentGroup = [];
      acc.isGrouping = false;
    } else if (acc.isGrouping) {
      acc.currentGroup.push(block);
    } else {
      acc.groupedBlocks.push(block);
    }
    return acc;
  }, { groupedBlocks: [], currentGroup: [], isGrouping: false });

  if (currentGroup.length > 0) {
    groupedBlocks.push(currentGroup);
  }

  return groupedBlocks;
}

const isNotEmptyParagraphEl = (el) => !(el.nodeName === 'P' && !el.childNodes.length && el.textContent === '');

const preText = (el) => (el.matches?.('pre') ? [el] : [...(el.querySelectorAll?.('pre') || [])])
  .map((pre) => pre.textContent).join('\u0000');

// `smart` (smart-overwrite) needs a lossless block list: every section break, every element, and
// whitespace inside <pre> counted as content.
// keepAllBreaks: also keep the breaks of empty sections at the top of the page
function getBlocks(dom, { smart = false, keepAllBreaks = false } = {}) {
  const sections = [...dom.querySelectorAll('main > div')];

  // flatten sections so that they are just dividers between blocks
  const blocks = sections.reduce((acc, section, index) => {
    const sectionBlocks = smart ? [...section.children] : [...section.children]
      .filter(isNotEmptyParagraphEl);
    const marker = smart
      ? { ...sectionBlock, openTag: section.cloneNode(false).outerHTML.replace(/<\/div>$/, '') }
      : sectionBlock;
    const sectionArr = smart || (keepAllBreaks ? index : acc.length) ? [marker] : [];
    return [...acc, ...sectionArr, ...sectionBlocks];
  }, []);
  return groupBlocks(blocks);
}

function hashBlock(block, { smart = false } = {}) {
  const toHashString = (el) => {
    const normalized = normalizeHTMLFromElement(el);
    if (!smart) return normalized;
    if (el.isSection) return `${normalized}${el.openTag}`;
    const pre = preText(el);
    return pre ? `${normalized}${pre}` : normalized;
  };
  const stringToHash = Array.isArray(block)
    ? block.map(toHashString).join('')
    : toHashString(block);
  return hashContent(stringToHash);
}

const countSectionBreaks = (blocks) => blocks.filter((block) => block.isSection).length;

// alignSections: both documents have the same number of section breaks, so they line up in order
function getBlockMap(blocks, alignSections) {
  return blocks.map((block, index) => {
    // Number each section break so the 1st break only matches the 1st break, the 2nd the 2nd, etc.
    if (block.isSection && alignSections) {
      const sectionNumber = countSectionBreaks(blocks.slice(0, index + 1));
      return { block, sectionNumber, hash: hashContent(`${block.outerHTML}-${sectionNumber}`) };
    }
    return { block, hash: hashBlock(block) };
  });
}

// Smart hashes never number section breaks, so adding a section doesn't change other baselines.
function getSmartBlockMap(dom) {
  const options = { smart: true };
  return getBlocks(dom, options).map((block) => ({ block, hash: hashBlock(block, options) }));
}

function htmldiff(originalDOM, modifiedDOM) {
  const originalBlocks = getBlocks(originalDOM, { keepAllBreaks: true });
  const modifiedBlocks = getBlocks(modifiedDOM, { keepAllBreaks: true });
  const alignSections = countSectionBreaks(originalBlocks) === countSectionBreaks(modifiedBlocks);
  const original = alignSections ? originalBlocks : getBlocks(originalDOM);
  const modified = alignSections ? modifiedBlocks : getBlocks(modifiedDOM);
  const diffArr = blockDiff(
    getBlockMap(original, alignSections),
    getBlockMap(modified, alignSections),
  );
  return diffArr;
}

function wrapElement(targetElement, wrapperElementTag) {
  const wrapperElement = document.createElement(wrapperElementTag);
  wrapperElement.appendChild(targetElement);
  return wrapperElement;
}

const SECTION_DIV_BREAK = '</div><div>';
const DIFF_INNER_SECTION_MARK = '<hr />';

/**
 * @param {Array<Element | typeof sectionBlock>} blockGroup
 * @param {{ sectionSeparator?: string }} [options]
 */
function getGroupInnerHtml(blockGroup, { sectionSeparator = SECTION_DIV_BREAK } = {}) {
  let htmlText = '';
  blockGroup.forEach((block) => {
    if (block.isSection) {
      htmlText += sectionSeparator;
      return;
    }
    htmlText += block.outerHTML;
  });
  return htmlText;
}

function diffEntryNeedsSectionBreakBefore(diff, index) {
  if (index === 0) return false;
  const prev = diff[index - 1];
  // A changed group before this one has already added a break after itself
  const prevIsChangedGroup = Array.isArray(prev?.block) && prev.type !== SAME;
  return Boolean(prev && !prev.block?.isSection && !prevIsChangedGroup);
}

function diffEntryNeedsSectionBreakAfter(diff, index, consumedCount) {
  const afterIndex = index + consumedCount;
  if (afterIndex >= diff.length) return false;
  const after = diff[afterIndex];
  return Boolean(after && !after.block?.isSection);
}

function appendPairedDiffedBlockGroupsHtml({
  htmlText, deletedGroup, addedGroup,
}) {
  const diffSep = { sectionSeparator: DIFF_INNER_SECTION_MARK };
  const deletedInner = getGroupInnerHtml(deletedGroup, diffSep);
  addedGroup[0]?.setAttribute(ADDED_TAG, '');
  const addedInner = getGroupInnerHtml(addedGroup, diffSep);
  return `${htmlText}<${DELETED_TAG}>${deletedInner}</${DELETED_TAG}>${addedInner}`;
}

function appendSingleDiffedBlockGroupHtml({ htmlText, type, blockGroup }) {
  const diffSep = { sectionSeparator: DIFF_INNER_SECTION_MARK };
  if (type === DELETED) {
    const inner = getGroupInnerHtml(blockGroup, diffSep);
    return `${htmlText}<${DELETED_TAG}>${inner}</${DELETED_TAG}>`;
  }
  blockGroup[0]?.setAttribute(ADDED_TAG, '');
  const inner = getGroupInnerHtml(blockGroup, diffSep);
  return `${htmlText}${inner}`;
}

function buildHtmlFromDiff(diff, modified, acceptedHashes = [], rejectedHashes = []) {
  let htmlText = '<div>';
  for (let i = 0; i < diff.length; i += 1) {
    const item = diff[i];
    let modifiedBlock = item.block;
    const hash = item.hash.substring(0, HASH_LENGTH);

    if (item.block.isSection) {
      htmlText += SECTION_DIV_BREAK;
      // eslint-disable-next-line no-continue
      continue;
    }

    if (Array.isArray(item.block)) {
      if (item.type === SAME) {
        htmlText += getGroupInnerHtml(item.block);
        // eslint-disable-next-line no-continue
        continue;
      }

      const next = diff[i + 1];
      const isPairedDiff = item.type === DELETED
        && next?.type === ADDED
        && Array.isArray(next.block);

      if (isPairedDiff) {
        if (diffEntryNeedsSectionBreakBefore(diff, i)) {
          htmlText += SECTION_DIV_BREAK;
        }
        htmlText = appendPairedDiffedBlockGroupsHtml({
          htmlText,
          deletedGroup: item.block,
          addedGroup: next.block,
        });
        if (diffEntryNeedsSectionBreakAfter(diff, i, 2)) {
          htmlText += SECTION_DIV_BREAK;
        }
        i += 1;
        // eslint-disable-next-line no-continue
        continue;
      }

      if (diffEntryNeedsSectionBreakBefore(diff, i)) {
        htmlText += SECTION_DIV_BREAK;
      }
      htmlText = appendSingleDiffedBlockGroupHtml({
        htmlText,
        type: item.type,
        blockGroup: item.block,
      });
      if (diffEntryNeedsSectionBreakAfter(diff, i, 1)) {
        htmlText += SECTION_DIV_BREAK;
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    // Rejected hashes only skip incoming blocks, never the target's own (ADDED) blocks
    if (item.type === ADDED) {
      if (!acceptedHashes.includes(hash)) {
        modifiedBlock.setAttribute(ADDED_TAG, '');
      }
    } else if (item.type === DELETED) {
      if (rejectedHashes.includes(hash)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (!acceptedHashes.includes(hash)) {
        modifiedBlock = wrapElement(item.block, DELETED_TAG);
      }
    }
    htmlText += modifiedBlock.outerHTML;
  }
  htmlText += '</div>';

  modified.documentElement.querySelector('main').innerHTML = htmlText;
  return modified;
}

// List items wrap added content in a <da-diff-added> element instead of using the attribute.
export const LOC_MARKERS = `${DELETED_TAG}, ${ADDED_TAG}, [${ADDED_TAG}], da-loc-added, da-loc-deleted, [loc-temp-dom]`;

export const isSnapshotPath = (path) => path.includes('/.snapshots/');

// Remove all diff tags - document is updated to only keep local changes, upstream is deleted
export const removeLocTags = (html) => {
  // TODO: Remove da-loc-deleted once we've migrated all regional edits to the new loc tags
  const locElsToRemove = html.querySelectorAll(`${DELETED_TAG}, [loc-temp-dom], da-loc-deleted`);
  locElsToRemove.forEach((el) => el.remove());

  // Keep added content: old regional edits (da-loc-added) and list items (<li><da-diff-added>)
  const daLocAddedEls = html.querySelectorAll(`da-loc-added, ${ADDED_TAG}`);
  daLocAddedEls.forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  });

  const addedEls = html.querySelectorAll(`[${ADDED_TAG}]`);
  addedEls.forEach((el) => {
    el.removeAttribute(ADDED_TAG);
  });
};

const getEquivalentSites = (config) => {
  const hostnames = findConfigValue(config, 'source.fragment.hostnames')?.split?.(',') || [];
  return new Set(hostnames.map((hostname) => hostname.split('--')[1]));
};

const shortHash = (item) => item.hash.substring(0, HASH_LENGTH);

// Like merge, rejections only apply to single upstream blocks (never to groups or list items).
const isSingleBlock = (block) => !block.isSection && !Array.isArray(block);

// Hashes (and merge's reviewHash, single blocks only) come from a link-normalized copy.
async function getHashedBlocks(doc, { site, config, withReviewHash = false }) {
  const options = { smart: true };
  const normalized = await normalizeLinks(doc.cloneNode(true), site, getEquivalentSites(config));
  const hashed = getSmartBlockMap(normalized);
  return getBlocks(doc, options).map((block, idx) => ({
    block,
    hash: shortHash(hashed[idx]),
    ...(withReviewHash && isSingleBlock(block)
      ? { reviewHash: shortHash({ hash: hashBlock(hashed[idx].block) }) } : {}),
  }));
}

const isRejectedBlock = (rejected) => ({ reviewHash }) => !!reviewHash
  && rejected.includes(reviewHash);

export async function removeRejectedBlocks({
  doc, rejected = [], site, config,
}) {
  const copy = doc.cloneNode(true);
  if (!rejected.length) return copy;
  const blocks = await getHashedBlocks(copy, { site, config, withReviewHash: true });
  blocks.filter(isRejectedBlock(rejected)).forEach(({ block }) => {
    const section = block.parentElement;
    block.remove();
    const emptied = section && !section.children.length && !section.textContent.trim();
    // The last section stays: a saved empty page still has one.
    if (emptied && section.parentElement.children.length > 1) section.remove();
  });
  return copy;
}

export async function getBlockHashes({ doc, site, config }) {
  const blocks = await getHashedBlocks(doc, { site, config });
  return blocks.map(({ hash }) => hash);
}

export async function getContentHashes({ doc, site, config }) {
  const blocks = await getHashedBlocks(doc, { site, config });
  return blocks.filter(({ block }) => !block.isSection).map(({ hash }) => hash);
}

function buildHtmlFromBlocks(blocks) {
  const inner = blocks.reduce((html, { block }, idx) => {
    if (block.isSection) return `${html}${idx ? '</div>' : ''}${block.openTag || '<div>'}`;
    if (Array.isArray(block)) {
      const group = block.map((el) => (el.isSection ? `</div>${el.openTag || '<div>'}` : el.outerHTML));
      return `${html}${group.join('')}`;
    }
    return `${html}${block.outerHTML}`;
  }, '');
  return blocks[0]?.block.isSection ? `${inner}</div>` : `<div>${inner}</div>`;
}

/**
 * Block-level three-way merge. Applies upstream (source) changes made since the
 * base to the destination, keeping destination edits. When both sides changed
 * the same region, the destination wins and the change is counted as skipped.
 * @param {Object} params
 * @param {String[]} params.base ordered block hashes of the source at the last rollout
 * @param {Document} params.source the current upstream document
 * @param {Document} params.dest the current destination document
 * @param {String[]} [params.rejected] block hashes the author rejected in a merge review
 * @param {String} params.site the DA site, used for link normalization
 * @param {Object} params.config the translation config (equivalent fragment hostnames)
 * @returns {Promise<{ html: String, skipped: Number, sourceHashes: String[] }>} sourceHashes is the
 *   next baseline
 */
export async function smartMerge({
  base, source, dest, rejected = [], site, config,
}) {
  const withReviewHash = rejected.length > 0;
  const sourceBlocks = await getHashedBlocks(source, { site, config, withReviewHash });
  const destBlocks = await getHashedBlocks(dest, { site, config });
  const rejectedBlocks = sourceBlocks.filter(isRejectedBlock(rejected));
  const { default: threeWayMerge } = await import('./smart-merge.js');
  const { blocks, skipped, baseline } = threeWayMerge({
    base,
    source: sourceBlocks,
    dest: destBlocks,
    rejected: new Set(rejectedBlocks.map(({ hash }) => hash)),
  });
  return { html: buildHtmlFromBlocks(blocks), skipped, sourceHashes: baseline };
}

export async function regionalDiff(
  original,
  modified,
  acceptedHashes,
  rejectedHashes,
  { normalizeImages, site, config } = {},
) {
  const equivalentSites = getEquivalentSites(config);

  const normalizedOriginal = await normalizeLinks(original, site, equivalentSites);
  const normalizedModified = await normalizeLinks(modified, site, equivalentSites);
  // optional connector hook
  if (normalizeImages) normalizeImages(normalizedOriginal, normalizedModified);
  const diff = htmldiff(normalizedOriginal, normalizedModified);
  const output = buildHtmlFromDiff(diff, normalizedModified, acceptedHashes, rejectedHashes);
  return output.body.querySelector('main');
}
