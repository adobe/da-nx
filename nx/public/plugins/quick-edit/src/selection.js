import {
  findBlock, findImageAtProseIndex, pictureSrc, srcPathsMatch, OVERLAY_SELECTOR,
} from './dom-index.js';
import { parseIndex, positionBox } from './utils.js';
import { MESSAGE_TYPES } from '../../../../utils/message-types.js';

export function blockName(el) {
  return el?.classList?.[0] || '';
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
  return [...scope.querySelectorAll('picture')]
    .find((pic) => srcPathsMatch(pictureSrc(pic), src)) || null;
}

function resolveSelectionElement(node, root) {
  if (node.anchorType === 'table') {
    const block = findBlock(node.proseIndex, root);
    const blockIndex = parseIndex(block?.getAttribute?.('data-block-index'));
    return blockIndex === node.proseIndex ? block : null;
  }
  if (node.anchorType === 'image') {
    return findImageByIndex(node.proseIndex, root)
      || findImageAtProseIndex(node.proseIndex, root)
      || findPictureBySrc(node.src, node.proseIndex, root);
  }
  return null;
}

let currentSelectedNode = null;

function isSelectedBlock(block) {
  if (currentSelectedNode?.anchorType !== 'table') return false;
  return parseIndex(block.getAttribute('data-block-index')) === currentSelectedNode.proseIndex;
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

  if (node.anchorType === 'table') {
    const pill = root.createElement('div');
    pill.className = 'qe-selected-pill';
    fillPill(pill, root, blockName(element));
    box.appendChild(pill);
  }
}

function clearHoverPill(root = document) {
  const overlay = root.getElementById(SELECTION_OVERLAY_ID);
  if (!overlay) return;
  overlay.querySelector('.qe-hover-box')?.remove();
}

function drawHoverPill(block, root = document) {
  const overlay = getSelectionOverlay(root);
  clearHoverPill(root);
  const rect = block.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const box = root.createElement('div');
  box.className = 'qe-hover-box';
  box.setAttribute('aria-hidden', 'true');
  positionBox(box, rect);
  overlay.appendChild(box);
  const pill = root.createElement('button');
  pill.type = 'button';
  pill.className = 'qe-selected-pill is-hover';
  fillPill(pill, root, blockName(block));
  pill.dataset.blockIndex = block.getAttribute('data-block-index');
  box.appendChild(pill);
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
    const block = e.target.closest?.('[data-block-index]');
    if (!block || e.target.closest(OVERLAY_SELECTOR)) return;
    if (isSelectedBlock(block)) return;
    drawHoverPill(block);
  });
  document.addEventListener('mouseout', (e) => {
    const toBlock = e.relatedTarget?.closest?.('[data-block-index]');
    const toPill = e.relatedTarget?.closest?.('.qe-selected-pill.is-hover');
    if (!toBlock && !toPill) clearHoverPill();
  });

  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    const pill = t.closest?.('.qe-selected-pill.is-hover');
    if (pill) {
      e.preventDefault();
      e.stopPropagation();
      const node = blockSelectPayload(pill);
      if (!node) return;
      blurActiveEditor();
      clearHoverPill();
      activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, node, payload: { node } });
      return;
    }

    if (!currentSelectedNode) return;
    if (t.closest?.(OVERLAY_SELECTOR)
      || t.closest?.('picture')
      || t.closest?.('[data-prose-index]')) return;
    const selectedEl = resolveSelectionElement(currentSelectedNode, document);
    if (selectedEl?.contains?.(t)) return;
    activeCtx?.port?.postMessage({
      type: MESSAGE_TYPES.NODE_SELECT, node: null, payload: { node: null },
    });
  });

  document.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('picture') && activeCtx) activeCtx.nodeSelectDragging = true;
  }, true);
  document.addEventListener('dragend', () => {
    setTimeout(() => { if (activeCtx) activeCtx.nodeSelectDragging = false; }, 0);
  }, true);

  document.addEventListener('click', (e) => {
    const picture = e.target.closest?.('picture');
    if (!picture || activeCtx?.nodeSelectDragging) return;
    const node = imageSelectPayload(picture);
    if (!node) return;
    blurActiveEditor();
    activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, node, payload: { node } });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!currentSelectedNode) return;
    activeCtx?.port?.postMessage({
      type: MESSAGE_TYPES.NODE_SELECT, node: null, payload: { node: null },
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
