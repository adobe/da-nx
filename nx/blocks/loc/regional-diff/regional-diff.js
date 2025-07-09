/* global objectHash */
import { getPathDetails, fetchConfig } from '../utils/utils.js';

// eslint-disable-next-line import/no-unresolved
import './object_hash.js';

const MIN_LIST_ITEMS_IN_COMMON = 2;
const ADDED = 'added';
const ADDED_TAG = 'da-loc-added';
const DELETED = 'deleted';
const DELETED_TAG = 'da-loc-deleted';
const SAME = 'same';

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
  let html = clone.outerHTML.replace(/>\s+</g, '><');
  // Remove all line breaks and tabs
  html = html.replace(/[\n\r\t]/g, '');
  // Optionally, collapse multiple spaces
  html = html.replace(/\s{2,}/g, ' ');
  return html.trim();
}

export async function normalizeLinks(doc, site, equivalentSites) {
  // convert all urls with .hlx.page, .hlx.live, .aem.page, .aem.live to .aem.live
  const links = doc.querySelectorAll('a[href*=".hlx.page/"], a[href*=".hlx.live/"], a[href*=".aem.page/"], a[href*=".aem.live/"], source[srcset*=".hlx.page/"], source[srcset*=".hlx.live/"], source[srcset*=".aem.page/"], source[srcset*=".aem.live/"], img[src*=".hlx.page/"], img[src*=".hlx.live/"], img[src*=".aem.page/"], img[src*=".aem.live/"]');
  links.forEach((link) => {
    link.href = link.href.replace(/\.hlx\.page\/|\.hlx\.live\/|\.aem\.page\//g, '.aem.live/');
    const linkSite = link.href.split('--')[1];
    if (equivalentSites.has(linkSite)) {
      link.href = link.href.replace(`--${linkSite}--`, `--${site}--`);
    }
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
    child.hash = objectHash(child.outerHTML);
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
        const mergedList = blockDiff(addedListItems, deletedListItems, true);
        addedList.block.innerHTML = convertToHtmlList(mergedList);
        addedList.type = SAME;
      }
    });
  });
  return result;
}

function addToResult(result, newItem, type) {
  for (let i = 0; i < result.length; i += 1) {
    const resultItem = result[i];
    if (resultItem.hash !== newItem.hash || resultItem.type === SAME) {
      // eslint-disable-next-line no-continue
      continue;
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

function blockDiff(A, B, isListCheck = false) {
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

function getBlockMap(dom) {
  const sections = [...dom.querySelectorAll('main > div')];

  // flatten sections so that they are just dividers between blocks
  let blocks = sections.reduce((acc, section) => {
    const sectionBlocks = [...section.children]
      .filter(isNotEmptyParagraphEl);
    const sectionArr = acc.length ? [sectionBlock] : [];
    return [...acc, ...sectionArr, ...sectionBlocks];
  }, []);

  blocks = groupBlocks(blocks);

  return blocks.map((block) => {
    const stringToHash = Array.isArray(block)
      ? block.map(normalizeHTMLFromElement).join('')
      : normalizeHTMLFromElement(block);
    const hash = objectHash(stringToHash);
    return { block, hash };
  });
}

function htmldiff(originalDOM, modifiedDOM) {
  const original = getBlockMap(originalDOM);
  const modified = getBlockMap(modifiedDOM);
  const diffArr = blockDiff(original, modified);
  return diffArr;
}

function wrapElement(targetElement, wrapperElementTag) {
  const wrapperElement = document.createElement(wrapperElementTag);
  wrapperElement.appendChild(targetElement);
  return wrapperElement;
}

function getGroupInnerHtml(blockGroup) {
  let htmlText = '';
  blockGroup.forEach((block) => {
    if (block.isSection) {
      htmlText += '</div><div>';
      return;
    }
    htmlText += block.outerHTML;
  });
  return htmlText;
}

function getBlockgroupHtml(blockGroup, type) {
  // Modified block groups automatically get sections at start and end
  const htmlText = getGroupInnerHtml(blockGroup);

  if (type === ADDED) {
    return `<${ADDED_TAG} class="da-group"><div>${htmlText}</div></${ADDED_TAG}>`;
  }
  if (type === DELETED) {
    return `<${DELETED_TAG} class="da-group"><div>${htmlText}</div></${DELETED_TAG}>`;
  }
  return htmlText;
}

function buildHtmlFromDiff(diff, modified) {
  let htmlText = '<div>';
  diff.forEach((item, i) => {
    let modifiedBlock = item.block;
    if (item.block.isSection && i !== 0) {
      htmlText += '</div><div>';
      return;
    }

    if (Array.isArray(item.block)) {
      htmlText += getBlockgroupHtml(item.block, item.type);
      return;
    }

    if (item.type === ADDED) {
      modifiedBlock = wrapElement(item.block, ADDED_TAG);
    } else if (item.type === DELETED) {
      modifiedBlock = wrapElement(item.block, DELETED_TAG);
    }
    htmlText += modifiedBlock.outerHTML;
  });
  htmlText += '</div>';

  modified.documentElement.querySelector('main').innerHTML = htmlText;
  return modified;
}

export const removeLocTags = (html) => {
  const locElsToRemove = html.querySelectorAll('da-loc-deleted, [loc-temp-dom]');
  locElsToRemove.forEach((el) => el.remove());

  const tags = html.querySelectorAll('da-loc-added');

  // Iterate over each tag
  tags.forEach((tag) => {
    while (tag.firstChild) {
      tag.parentNode.insertBefore(tag.firstChild, tag);
    }
    tag.parentNode.removeChild(tag);
  });
};

export async function regionalDiff(original, modified) {
  const { org, site } = getPathDetails();
  const translateConfig = await fetchConfig(org, site);
  const hostnames = findConfigValue(translateConfig, 'source.fragment.hostnames')?.split?.(',') || [];
  const equivalentSites = new Set(hostnames.map((hostname) => hostname.split('--')[1]));

  const normalizedOriginal = await normalizeLinks(original, site, equivalentSites);
  const normalizedModified = await normalizeLinks(modified, site, equivalentSites);
  const diff = htmldiff(normalizedOriginal, normalizedModified);
  const output = buildHtmlFromDiff(diff, normalizedModified);
  return output.body.querySelector('main');
}
