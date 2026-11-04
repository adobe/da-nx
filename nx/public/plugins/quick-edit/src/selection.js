import {
  findBlock, findSection, findTextBlock, pictureSrc, srcPathsMatch, OVERLAY_SELECTOR,
} from './dom-index.js';
import { parseIndex, positionBox } from './utils.js';
import { MESSAGE_TYPES } from '../../../../utils/message-types.js';

export function blockName(el) {
  return el?.classList?.[0] || '';
}

// Block name plus authored variant, e.g. `hero (center)`. Variant comes from
// data-block-variant (see restoreBlockIndices), not live classes which include decoration.
export function blockLabel(el) {
  const name = blockName(el);
  if (!name) return '';
  const variant = el?.getAttribute?.('data-block-variant') || '';
  return variant ? `${name} (${variant})` : name;
}

function fillPill(pill, root, name) {
  const grip = root.createElement('span');
  grip.className = 'qe-pill-grip';
  grip.setAttribute('aria-hidden', 'true');
  const label = root.createElement('span');
  label.textContent = name;
  pill.append(grip, label);
}

export function blockSelectPayload(el) {
  const proseIndex = parseIndex(el?.getAttribute?.('data-block-index'));
  if (proseIndex == null) return null;
  return { anchorType: 'table', proseIndex };
}

export function imageSelectPayload(el) {
  const picture = el?.tagName === 'PICTURE' ? el : el?.closest?.('picture');
  const host = picture || (el?.tagName === 'IMG' ? el : null);
  if (!host) return null;
  const indexEl = host.matches?.('[data-image-index]')
    ? host
    : host.querySelector?.('[data-image-index]');
  const proseIndex = parseIndex(indexEl?.getAttribute?.('data-image-index'));
  const src = pictureSrc(host);
  const blockIndex = parseIndex(host.closest?.('[data-block-index]')?.getAttribute?.('data-block-index'));
  if (proseIndex == null && !src) return null;
  return { anchorType: 'image', proseIndex, src, blockIndex };
}

export function sectionLabel(el, sectionIndex) {
  return el?.dataset?.sectionName || `Section ${sectionIndex + 1}`;
}

export function sectionSelectPayload(el) {
  const sectionIndex = parseIndex(el?.getAttribute('data-section-index'));
  if (sectionIndex == null) return null;
  return { anchorType: 'section', sectionIndex };
}

const SELECTION_OVERLAY_ID = 'qe-selection-overlay';

function getSelectionOverlay(root = document) {
  let overlay = root.getElementById(SELECTION_OVERLAY_ID);
  if (!overlay) {
    overlay = root.createElement('div');
    overlay.id = SELECTION_OVERLAY_ID;
    overlay.className = SELECTION_OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    root.body.append(overlay);
  }
  return overlay;
}

function clearSelectionOverlay(root = document) {
  const overlay = root.getElementById(SELECTION_OVERLAY_ID);
  if (!overlay) return;
  overlay.querySelector('.qe-selected-box')?.remove();
}

function findImageByIndex(proseIndex, root = document) {
  if (proseIndex == null) return null;
  const el = root.querySelector?.(`[data-image-index="${proseIndex}"]`);
  return el?.closest?.('picture') || el || null;
}

function findPictureBySrc(src, proseIndex, root = document) {
  if (!src) return null;
  const scope = (proseIndex != null && findBlock(proseIndex, root)) || root;
  const matches = [...scope.querySelectorAll('picture')]
    .filter((pic) => srcPathsMatch(pictureSrc(pic), src));
  return matches.length === 1 ? matches[0] : null;
}

function findContentByIndex(proseIndex, root = document) {
  if (proseIndex == null) return null;
  const el = findTextBlock(proseIndex, root);
  const elIndex = parseIndex(el?.getAttribute?.('data-prose-index'));
  return elIndex === proseIndex ? el : null;
}

function resolveSelectionElement(node, root) {
  if (node.anchorType === 'table') {
    const block = findBlock(node.proseIndex, root);
    const blockIndex = parseIndex(block?.getAttribute?.('data-block-index'));
    return blockIndex === node.proseIndex ? block : null;
  }
  if (node.anchorType === 'image') {
    if (node.proseIndex != null) return findImageByIndex(node.proseIndex, root);
    return findPictureBySrc(node.src, node.blockIndex, root);
  }
  if (node.anchorType === 'content') {
    return findContentByIndex(node.proseIndex, root);
  }
  if (node.anchorType === 'section') {
    return findSection(node.sectionIndex, root);
  }
  return null;
}

let currentSelectedNode = null;

function isSelectedBlock(block) {
  if (currentSelectedNode?.anchorType !== 'table') return false;
  return parseIndex(block.getAttribute('data-block-index')) === currentSelectedNode.proseIndex;
}

function isSelectedSection(section) {
  if (currentSelectedNode?.anchorType !== 'section') return false;
  return sectionSelectPayload(section)?.sectionIndex === currentSelectedNode.sectionIndex;
}

function nodeLabel(node, el) {
  if (node.anchorType === 'table') return blockLabel(el);
  if (node.anchorType === 'section') return sectionLabel(el, node.sectionIndex);
  return '';
}

export function getSelectedNode() {
  return currentSelectedNode;
}

export function setSelectedNode(node, root = document, { scrollIntoView = false } = {}) {
  currentSelectedNode = node;
  clearSelectionOverlay(root);
  if (!node) return;
  const element = resolveSelectionElement(node, root);
  if (!element) return;
  if (scrollIntoView) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return;

  const overlay = getSelectionOverlay(root);
  const box = root.createElement('div');
  box.className = 'qe-selected-box';
  box.setAttribute('aria-hidden', 'true');
  positionBox(box, rect);
  overlay.appendChild(box);

  const label = nodeLabel(node, element);
  if (!label) return;
  const pill = root.createElement('div');
  pill.className = 'qe-selected-pill';
  fillPill(pill, root, label);
  box.appendChild(pill);
}

let hovered = null;

function clearHover(root = document) {
  hovered = null;
  root.getElementById(SELECTION_OVERLAY_ID)?.querySelector('.qe-hover-box')?.remove();
}

function drawHover(el, node, root = document) {
  clearHover(root);
  if (!node) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const box = root.createElement('div');
  box.className = 'qe-hover-box';
  box.setAttribute('aria-hidden', 'true');
  positionBox(box, rect);
  getSelectionOverlay(root).appendChild(box);
  const pill = root.createElement('button');
  pill.type = 'button';
  pill.className = 'qe-selected-pill is-hover';
  fillPill(pill, root, nodeLabel(node, el));
  box.appendChild(pill);
  hovered = { el, node };
}

function blurActiveEditor() {
  const active = document.activeElement;
  if (active?.closest?.('.prosemirror-editor')) active.blur();
}

let selectionListenersBound = false;
let activeCtx = null;

export function setupNodeSelection(ctx) {
  activeCtx = ctx;
  if (ctx) ctx.nodeSelectDragging = false;
  if (selectionListenersBound) return;
  selectionListenersBound = true;

  document.addEventListener('mouseover', (e) => {
    if (e.target.closest?.(OVERLAY_SELECTOR)) return;
    const block = e.target.closest?.('[data-block-index]');
    if (block) {
      if (isSelectedBlock(block)) clearHover();
      else drawHover(block, blockSelectPayload(block));
      return;
    }
    // Content inside a section keeps hover priority over the section itself.
    if (e.target.closest?.('picture') || e.target.closest?.('[data-prose-index]')) {
      clearHover();
      return;
    }
    const section = e.target.closest?.('[data-section-index]');
    if (!section || isSelectedSection(section)) clearHover();
    else drawHover(section, sectionSelectPayload(section));
  });
  document.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget;
    if (hovered?.el.contains(to) || to?.closest?.('.qe-selected-pill.is-hover')) return;
    clearHover();
  });

  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    const pill = t.closest?.('.qe-selected-pill.is-hover');
    if (pill) {
      // Keep the pressed target alive until click, including for click forwarding.
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (t.closest?.(OVERLAY_SELECTOR)
      || t.closest?.('picture')
      || t.closest?.('[data-prose-index]')) return;

    const block = t.closest?.('[data-block-index]');
    if (block) {
      const node = blockSelectPayload(block);
      if (!node) return;
      if (currentSelectedNode?.anchorType === 'table'
        && currentSelectedNode.proseIndex === node.proseIndex) return;
      blurActiveEditor();
      clearHover();
      activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, payload: { node } });
      return;
    }

    const section = t.closest?.('[data-section-index]');
    if (section) {
      const node = sectionSelectPayload(section);
      if (!node || isSelectedSection(section)) return;
      blurActiveEditor();
      clearHover();
      activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, payload: { node } });
      return;
    }

    if (!currentSelectedNode) return;
    const selectedEl = resolveSelectionElement(currentSelectedNode, document);
    if (selectedEl?.contains?.(t)) return;
    activeCtx?.port?.postMessage({
      type: MESSAGE_TYPES.NODE_SELECT, payload: { node: null },
    });
  });

  document.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('picture') && activeCtx) activeCtx.nodeSelectDragging = true;
  }, true);
  document.addEventListener('dragend', () => {
    setTimeout(() => { if (activeCtx) activeCtx.nodeSelectDragging = false; }, 0);
  }, true);

  document.addEventListener('click', (e) => {
    const pill = e.target.closest?.('.qe-selected-pill.is-hover');
    if (pill) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const node = hovered?.node;
      if (!node) return;
      blurActiveEditor();
      clearHover();
      activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, payload: { node } });
      return;
    }

    const picture = e.target.closest?.('picture');
    if (!picture || activeCtx?.nodeSelectDragging) return;
    const node = imageSelectPayload(picture);
    if (!node) return;
    blurActiveEditor();
    activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, payload: { node } });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!currentSelectedNode) return;
    activeCtx?.port?.postMessage({
      type: MESSAGE_TYPES.NODE_SELECT, payload: { node: null },
    });
  });

  let scheduled = false;
  const reposition = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (currentSelectedNode) setSelectedNode(currentSelectedNode);
    });
  };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
}
