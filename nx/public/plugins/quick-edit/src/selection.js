import {
  findBlock, findImageAtProseIndex, pictureSrc, srcPathsMatch, OVERLAY_SELECTOR,
} from './dom-index.js';
import { parseIndex, positionBox } from './utils.js';
import { MESSAGE_TYPES } from '../../../../utils/message-types.js';

export function blockName(el) {
  return el?.classList?.[0] || '';
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
let variantCatalog = {};
let selectionListenersBound = false;
let activeCtx = null;
let pendingVariantScrollIndex = null;

export function setVariantCatalog(catalog) {
  variantCatalog = catalog || {};
}

export function getVariantCatalog() {
  return variantCatalog;
}

export function takePendingVariantScrollIndex() {
  const index = pendingVariantScrollIndex;
  pendingVariantScrollIndex = null;
  return index;
}

function findVariants(name) {
  const nameLower = name.toLowerCase();
  return Object.entries(variantCatalog)
    .find(([key]) => key.toLowerCase() === nameLower)?.[1];
}

function slugifyToken(text) {
  return text.toLowerCase().replace(/[^0-9a-z]+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
}

function activeTokensFor(element, tokens) {
  if (!element) return [];
  const modifierClasses = [...element.classList].slice(1);
  return tokens.filter((token) => modifierClasses.includes(slugifyToken(token)));
}

function composeVariantLabel(name, tokens, activeSet) {
  const ordered = tokens.filter((token) => activeSet.has(token));
  return ordered.length ? `${name} (${ordered.join(', ')})` : name;
}

const VARIANT_MENU_ID = 'qe-variant-menu';

function closeVariantMenu(root = document) {
  root.getElementById(VARIANT_MENU_ID)?.remove();
}

function applyVariantToggle(root, name, tokens, element, token) {
  const selectNode = blockSelectPayload(element);
  if (!selectNode) return;
  const activeSet = new Set(activeTokensFor(element, tokens));
  if (activeSet.has(token)) activeSet.delete(token); else activeSet.add(token);
  const label = composeVariantLabel(name, tokens, activeSet);
  const applyNode = { proseIndex: selectNode.proseIndex };

  activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, payload: { node: selectNode } });
  activeCtx?.port?.postMessage({
    type: MESSAGE_TYPES.APPLY_VARIANT, payload: { node: applyNode, label },
  });
  closeVariantMenu(root);
  // eslint-disable-next-line no-use-before-define
  clearHoverPill(root);
  pendingVariantScrollIndex = selectNode.proseIndex;
  // eslint-disable-next-line no-use-before-define
  setSelectedNode(selectNode, root);
}

function openVariantMenu(triggerEl, root, name, tokens, element) {
  const menuEl = root.createElement('div');
  menuEl.id = VARIANT_MENU_ID;
  menuEl.className = 'qe-variant-menu';
  menuEl.ownerTrigger = triggerEl;

  const active = activeTokensFor(element, tokens);
  tokens.forEach((token) => {
    const item = root.createElement('button');
    item.type = 'button';
    item.className = 'qe-variant-menu-item';
    if (active.includes(token)) item.classList.add('is-active');
    item.textContent = token;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyVariantToggle(root, name, tokens, element, token);
    });
    menuEl.appendChild(item);
  });

  const rect = triggerEl.getBoundingClientRect();
  menuEl.style.left = `${rect.left + window.scrollX}px`;
  menuEl.style.top = `${rect.bottom + window.scrollY + 4}px`;
  getSelectionOverlay(root).appendChild(menuEl);
}

function createVariantButton(root, name, tokens, element) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'qe-pill-block-variant-select';
  button.setAttribute('aria-label', 'Change block variant');
  const icon = root.createElement('span');
  icon.className = 'qe-pill-block-variant-select-icon';
  icon.setAttribute('aria-hidden', 'true');
  button.appendChild(icon);
  button.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const existing = root.getElementById(VARIANT_MENU_ID);
    const wasOpenForThisTrigger = existing?.ownerTrigger === button;
    closeVariantMenu(root);
    if (wasOpenForThisTrigger) return;
    openVariantMenu(button, root, name, tokens, element);
  });
  return button;
}

function fillPill(pill, root, name) {
  const grip = root.createElement('span');
  grip.className = 'qe-pill-grip';
  grip.setAttribute('aria-hidden', 'true');
  const label = root.createElement('span');
  label.textContent = name;
  pill.append(grip, label);
}

function appendPillRow(box, root, ...children) {
  const row = root.createElement('div');
  row.className = 'qe-pill-row';
  row.append(...children.filter(Boolean));
  box.appendChild(row);
}

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
    const name = blockName(element);
    const pill = root.createElement('div');
    pill.className = 'qe-selected-pill';
    fillPill(pill, root, name);
    const tokens = findVariants(name);
    const button = tokens?.length ? createVariantButton(root, name, tokens, element) : null;
    appendPillRow(box, root, pill, button);
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
  const name = blockName(block);
  const pill = root.createElement('div');
  pill.className = 'qe-selected-pill is-hover';
  fillPill(pill, root, name);
  pill.dataset.blockIndex = block.getAttribute('data-block-index');
  const tokens = findVariants(name);
  const button = tokens?.length ? createVariantButton(root, name, tokens, block) : null;
  appendPillRow(box, root, pill, button);
}

function blurActiveEditor() {
  const active = document.activeElement;
  if (active?.closest?.('.prosemirror-editor')) active.blur();
}

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
    const toButton = e.relatedTarget?.closest?.('.qe-pill-block-variant-select');
    const toMenu = e.relatedTarget?.closest?.(`#${VARIANT_MENU_ID}`);
    if (toBlock || toPill || toButton || toMenu) return;
    clearHoverPill();
    const openMenu = document.getElementById(VARIANT_MENU_ID);
    if (openMenu?.ownerTrigger?.closest('.qe-hover-box')) closeVariantMenu();
  });

  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    closeVariantMenu();

    const pill = t.closest?.('.qe-selected-pill.is-hover');
    if (pill) {
      e.preventDefault();
      e.stopPropagation();
      const node = blockSelectPayload(pill);
      if (!node) return;
      blurActiveEditor();
      clearHoverPill();
      activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, payload: { node } });
      return;
    }

    if (!currentSelectedNode) return;
    if (t.closest?.(OVERLAY_SELECTOR)
      || t.closest?.('picture')
      || t.closest?.('[data-prose-index]')) return;
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
    const picture = e.target.closest?.('picture');
    if (!picture || activeCtx?.nodeSelectDragging) return;
    const node = imageSelectPayload(picture);
    if (!node) return;
    blurActiveEditor();
    activeCtx?.port?.postMessage({ type: MESSAGE_TYPES.NODE_SELECT, payload: { node } });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById(VARIANT_MENU_ID)) {
      closeVariantMenu();
      return;
    }
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
