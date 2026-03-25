/**
 * Minimal horizontal formatting toolbar for the document view.
 * Covers the "Edit Text" surface from da-live: block type selector
 * (Paragraph / H1–H6 / Code block) plus inline mark toggles
 * (Bold, Italic, Underline, Strikethrough, Superscript, Subscript, Code)
 * and a link button (always shown, Spectrum dialog for editing).
 */
/* eslint-disable import/no-unresolved */
import { Plugin, toggleMark, setBlockType } from 'da-y-wrapper';
/* eslint-enable import/no-unresolved */
// --- AEM Assets ---

/**
 * Image button is enabled only when there is a document path in the hash
 * (org + repo at minimum). openAssets() uses getPathDetails() internally;
 * if the path isn't there it cannot open the picker regardless of config.
 */
function hasDocumentPath() {
  const hash = window.location.hash || '';
  const segments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return segments.length >= 2;
}

async function openAssetsDialog() {
  // da-assets.js mounts the dialog after <main>; ensure one exists in da-nx.
  if (!document.body.querySelector('main')) {
    const main = document.createElement('main');
    main.hidden = true;
    document.body.appendChild(main);
  }
  /* eslint-disable import/no-unresolved */
  const { openAssets } = await import('https://da.live/blocks/edit/da-assets/da-assets.js');
  /* eslint-enable import/no-unresolved */
  await openAssets();

  // The AEM asset selector (PureJSSelectors) is a React app that may render
  // portal content outside the <dialog>, so dialog.close() alone does not
  // fully unmount the selector UI.  Removing the dialog element on close
  // forces a full teardown; the next open re-creates it from scratch via
  // openAssets' own "not found → create" branch.
  const dialog = document.querySelector('.da-dialog-asset');
  if (dialog && !dialog.dataset.nxManaged) {
    dialog.dataset.nxManaged = '1';
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }
}

// --- Link helpers (logic mirrored from da-live linkItem.js, not exported there) ---

function findExistingLink(state, linkMarkType) {
  const { $from, $to, empty } = state.selection;
  if (empty) {
    const { node, offset } = $from.parent.childAfter($from.parentOffset);
    return { link: node, offset };
  }
  let result;
  $from.parent.nodesBetween($from.parentOffset, $to.parentOffset, (node, pos) => {
    if (linkMarkType.isInSet(node.marks)) result = { link: node, offset: pos };
  });
  return result;
}

function calculateLinkPosition(state, link, offset) {
  const { $from } = state.selection;
  const start = $from.pos - ($from.parentOffset - offset);
  return { start, end: start + link.nodeSize };
}

function applyLinkTransaction(view, { href, text, title }, rangeStart, rangeEnd) {
  const { state } = view;
  const { schema } = state;
  const linkMarkType = schema.marks.link;
  const newHref = href?.trim();
  const newTitle = title?.trim() || null;

  let { tr } = state;

  if (!newHref) {
    // Empty href: remove existing link mark
    tr = tr.removeMark(rangeStart, rangeEnd, linkMarkType);
    view.dispatch(tr);
    if (!view.hasFocus()) view.focus();
    return;
  }

  // Empty display text falls back to the URL (mirrors da-live behavior)
  const displayText = text?.trim() || newHref;

  let end = rangeEnd;
  const originalText = state.doc.textBetween(rangeStart, rangeEnd);
  const textChanged = displayText !== originalText || (rangeStart === rangeEnd && displayText);

  if (textChanged) {
    const existingMarks = [];
    if (rangeStart < state.doc.content.size) {
      state.doc.resolve(rangeStart).parent.content.content[0]?.marks?.forEach((mark) => {
        if (mark.type !== linkMarkType) existingMarks.push(mark);
      });
    }
    if (!existingMarks.length) {
      state.doc.nodesBetween(rangeStart, rangeEnd, (node) => {
        node.marks?.forEach((mark) => {
          if (mark.type !== linkMarkType && !existingMarks.find((m) => m.type === mark.type)) {
            existingMarks.push(mark);
          }
        });
      });
    }
    tr = tr.replaceWith(rangeStart, rangeEnd, schema.text(displayText, existingMarks));
    end = rangeStart + displayText.length;
  }

  tr = tr.removeMark(rangeStart, end, linkMarkType);
  const linkAttrs = { href: newHref };
  if (newTitle) linkAttrs.title = newTitle;
  tr = tr.addMark(rangeStart, end, linkMarkType.create(linkAttrs));

  view.dispatch(tr);
  if (!view.hasFocus()) view.focus();
}

// --- Link dialog (native <dialog> + sp-textfield / sp-button) ---
// sp-dialog's ObserveSlotPresence uses a MutationObserver that only fires for
// mutations *after* observation starts.  Children added before the element
// connects are invisible to it, so hasButtons stays false and the footer is
// never rendered.  Using a native <dialog> avoids all custom-element timing
// issues while still using sp-textfield / sp-button for Spectrum-consistent UI.

let linkDialogEl = null;
let hrefField = null;
let textField = null;
let titleField = null;
let okBtn = null;
let pendingConfirm = null;
let dialogHasExistingLink = false;

function isOkEnabled() {
  return !!(hrefField?.value?.trim() || dialogHasExistingLink);
}

function setOkEnabled(enabled) {
  if (okBtn) okBtn.disabled = !enabled;
}

function syncOkState() {
  setOkEnabled(isOkEnabled());
}

function closeLinkDialog() {
  linkDialogEl?.close();
  pendingConfirm = null;
}

function ensureLinkDialog() {
  if (linkDialogEl) return;

  // Inject light-DOM styles once (space.css is shadow-root scoped, so can't reach here)
  if (!document.getElementById('da-link-dialog-style')) {
    const style = document.createElement('style');
    style.id = 'da-link-dialog-style';
    style.textContent = `
      #da-link-dialog {
        padding: 24px;
        border: none;
        border-radius: var(--spectrum-corner-radius-200, 8px);
        min-width: 360px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.24);
        background: var(--spectrum-white, #fff);
        color: var(--spectrum-gray-900, #1d1d1d);
        font-family: var(--spectrum-sans-font-family-stack, adobe-clean, sans-serif);
      }
      #da-link-dialog::backdrop {
        background: rgba(0,0,0,0.4);
      }
      #da-link-dialog h3 {
        margin: 0 0 8px;
        font-size: var(--spectrum-heading-size-s, 18px);
        font-weight: 700;
      }
      #da-link-dialog hr {
        border: none;
        border-top: 1px solid var(--spectrum-gray-200, #e0e0e0);
        margin: 0 -24px 16px;
      }
      .da-link-dialog-fields {
        display: flex;
        flex-direction: column;
        gap: var(--spectrum-spacing-300, 12px);
        padding-block-end: var(--spectrum-spacing-300, 12px);
      }
      .da-link-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .da-link-field label {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--spectrum-gray-700, #4b4b4b);
      }
      .da-link-field input {
        height: 32px;
        padding: 0 8px;
        border: 1px solid var(--spectrum-gray-400, #b3b3b3);
        border-radius: var(--spectrum-corner-radius-100, 4px);
        font-size: 0.875rem;
        font-family: inherit;
        color: var(--spectrum-gray-900, #1d1d1d);
        background: var(--spectrum-white, #fff);
        outline: none;
      }
      .da-link-field input:focus {
        border-color: var(--spectrum-blue-700, #1473e6);
        box-shadow: 0 0 0 2px rgb(20 115 230 / 25%);
      }
      .da-link-dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--spectrum-spacing-200, 8px);
        padding-top: var(--spectrum-spacing-300, 12px);
        border-top: 1px solid var(--spectrum-gray-200, #e0e0e0);
      }
    `;
    document.head.appendChild(style);
  }

  linkDialogEl = document.createElement('dialog');
  linkDialogEl.id = 'da-link-dialog';

  const heading = document.createElement('h3');
  heading.textContent = 'Edit link';

  const divider = document.createElement('hr');

  const fieldGroup = document.createElement('div');
  fieldGroup.className = 'da-link-dialog-fields';

  function makeField(labelText, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'da-link-field';
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = placeholder;
    wrap.append(lbl, inp);
    return { wrap, inp };
  }

  const hrefWrap = makeField('URL', 'https://...');
  hrefField = hrefWrap.inp;

  const textWrap = makeField('Display text', 'Enter display text');
  textField = textWrap.inp;

  const titleWrap = makeField('Title', 'title');
  titleField = titleWrap.inp;

  fieldGroup.append(hrefWrap.wrap, textWrap.wrap, titleWrap.wrap);

  const footer = document.createElement('div');
  footer.className = 'da-link-dialog-footer';

  const cancelBtn = document.createElement('sp-button');
  cancelBtn.setAttribute('variant', 'secondary');
  cancelBtn.setAttribute('treatment', 'outline');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeLinkDialog);

  okBtn = document.createElement('sp-button');
  okBtn.setAttribute('variant', 'accent');
  okBtn.textContent = 'OK';
  okBtn.disabled = true;
  okBtn.addEventListener('click', () => {
    pendingConfirm?.();
    pendingConfirm = null;
    closeLinkDialog();
  });

  footer.append(cancelBtn, okBtn);
  linkDialogEl.append(heading, divider, fieldGroup, footer);
  // Append inside sp-theme so Spectrum CSS custom properties are inherited
  (document.querySelector('sp-theme') ?? document.body).appendChild(linkDialogEl);

  hrefField.addEventListener('input', syncOkState);
  textField.addEventListener('input', syncOkState);

  // Native <dialog> fires 'cancel' on Escape — prevent default close, handle ourselves
  linkDialogEl.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeLinkDialog();
  });

  // Click on the ::backdrop area closes the dialog
  linkDialogEl.addEventListener('click', (e) => {
    const { left, right, top, bottom } = linkDialogEl.getBoundingClientRect();
    if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) {
      closeLinkDialog();
    }
  });

  // Enter submits when OK is enabled
  linkDialogEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && isOkEnabled()) {
      e.preventDefault();
      pendingConfirm?.();
      pendingConfirm = null;
      closeLinkDialog();
    }
  });
}

function openLinkDialog(view) {
  ensureLinkDialog();

  const { state } = view;
  const linkMarkType = state.schema.marks.link;
  const { $from, $to } = state.selection;
  let rangeStart = $from.pos;
  let rangeEnd = $to.pos;

  const found = findExistingLink(state, linkMarkType);
  const existingMark = found?.link?.marks?.find((m) => m.type === linkMarkType);

  if (existingMark) {
    const pos = calculateLinkPosition(state, found.link, found.offset);
    rangeStart = pos.start;
    rangeEnd = pos.end;
    hrefField.value = existingMark.attrs.href || '';
    titleField.value = existingMark.attrs.title || '';
    textField.value = found.link.textContent || '';
    dialogHasExistingLink = true;
  } else {
    const selText = state.selection.empty ? '' : state.doc.textBetween(rangeStart, rangeEnd);
    const trimmed = selText.trim();
    textField.value = selText;
    hrefField.value = /^(https?|mailto):/.test(trimmed) ? trimmed : '';
    titleField.value = '';
    dialogHasExistingLink = false;
  }

  syncOkState();
  pendingConfirm = () => applyLinkTransaction(view, {
    href: hrefField.value,
    text: textField.value,
    title: titleField.value,
  }, rangeStart, rangeEnd);

  linkDialogEl.showModal();
}

// --- Toolbar ---

function isMarkActive(state, markType) {
  const { from, to, $from, $to, empty } = state.selection;
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marksAcross($to) || []);
  return state.doc.rangeHasMark(from, to, markType);
}

const MARKS = [
  { key: 'strong', title: 'Bold', css: 'da-tb-bold' },
  { key: 'em', title: 'Italic', css: 'da-tb-italic' },
  { key: 'u', title: 'Underline', css: 'da-tb-underline' },
  { key: 's', title: 'Strikethrough', css: 'da-tb-strike' },
  { key: 'sup', title: 'Superscript', css: 'da-tb-sup' },
  { key: 'sub', title: 'Subscript', css: 'da-tb-sub' },
  { key: 'code', title: 'Inline code', css: 'da-tb-code' },
];

const BLOCK_OPTIONS = [
  { label: 'Paragraph', node: 'paragraph', attrs: {} },
  { label: 'Heading 1', node: 'heading', attrs: { level: 1 } },
  { label: 'Heading 2', node: 'heading', attrs: { level: 2 } },
  { label: 'Heading 3', node: 'heading', attrs: { level: 3 } },
  { label: 'Heading 4', node: 'heading', attrs: { level: 4 } },
  { label: 'Heading 5', node: 'heading', attrs: { level: 5 } },
  { label: 'Heading 6', node: 'heading', attrs: { level: 6 } },
  { label: 'Code block', node: 'code_block', attrs: {} },
];

function blockOptionKey({ node, attrs }) {
  return node === 'heading' ? `heading-${attrs.level}` : node;
}

function getActiveBlock(state) {
  const { $from } = state.selection;
  let { depth } = $from;
  while (depth >= 0) {
    const node = $from.node(depth);
    if (node.type.name === 'heading') return `heading-${node.attrs.level}`;
    if (node.type.name === 'code_block') return 'code_block';
    if (node.type.name === 'paragraph') return 'paragraph';
    depth -= 1;
  }
  return 'paragraph';
}

function buildToolbar(view) {
  // ProseMirror's hasFocus() uses document.activeElement which, inside a shadow DOM,
  // returns the shadow host — not the contenteditable.  Track real doc-editor focus
  // explicitly so split-view behaves the same as doc-only view.
  let docEditorFocused = false;
  /* eslint-disable no-use-before-define */
  const onDocFocus = () => {
    docEditorFocused = true;
    update(view.state);
  };
  const onDocBlur = () => {
    docEditorFocused = false;
    update(view.state);
  };
  /* eslint-enable no-use-before-define */
  view.dom.addEventListener('focus', onDocFocus);
  view.dom.addEventListener('blur', onDocBlur);

  const bar = document.createElement('div');
  bar.className = 'da-prose-toolbar';

  // Block type <select>
  const select = document.createElement('select');
  select.className = 'da-tb-block-select';
  select.title = 'Block type';
  for (const opt of BLOCK_OPTIONS) {
    const option = document.createElement('option');
    option.value = blockOptionKey(opt);
    option.textContent = opt.label;
    select.appendChild(option);
  }
  // mousedown stop-prop prevents editor blur before change fires
  select.addEventListener('mousedown', (e) => e.stopPropagation());
  select.addEventListener('change', () => {
    const found = BLOCK_OPTIONS.find((o) => blockOptionKey(o) === select.value);
    if (!found) return;
    const nodeType = view.state.schema.nodes[found.node];
    if (!nodeType) return;
    setBlockType(nodeType, found.attrs)(view.state, view.dispatch);
    view.focus();
  });
  bar.appendChild(select);

  // Separator
  const sep = document.createElement('span');
  sep.className = 'da-tb-sep';
  bar.appendChild(sep);

  // Mark toggle buttons
  const markBtns = MARKS.map(({ key, title, css }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `da-tb-btn ${css}`;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    // mousedown + preventDefault keeps editor focus; the toggleMark runs before blur
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const markType = view.state.schema.marks[key];
      if (!markType) return;
      toggleMark(markType)(view.state, view.dispatch);
    });
    bar.appendChild(btn);
    return { btn, key };
  });

  // Link separator + button (always shown)
  const linkSep = document.createElement('span');
  linkSep.className = 'da-tb-sep';
  bar.appendChild(linkSep);

  const linkBtn = document.createElement('button');
  linkBtn.type = 'button';
  linkBtn.className = 'da-tb-btn da-tb-link';
  linkBtn.title = 'Link';
  linkBtn.setAttribute('aria-label', 'Link');
  linkBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    openLinkDialog(view);
  });
  bar.appendChild(linkBtn);

  const unlinkBtn = document.createElement('button');
  unlinkBtn.type = 'button';
  unlinkBtn.className = 'da-tb-btn da-tb-unlink';
  unlinkBtn.title = 'Remove link';
  unlinkBtn.setAttribute('aria-label', 'Remove link');
  unlinkBtn.disabled = true;
  unlinkBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const { state } = view;
    const linkMarkType = state.schema.marks.link;
    if (!linkMarkType || !isMarkActive(state, linkMarkType)) return;
    const found = findExistingLink(state, linkMarkType);
    if (!found?.link) return;
    const { start, end } = calculateLinkPosition(state, found.link, found.offset);
    view.dispatch(state.tr.removeMark(start, end, linkMarkType));
    view.focus();
  });
  bar.appendChild(unlinkBtn);

  // Image / AEM Assets button
  const imgSep = document.createElement('span');
  imgSep.className = 'da-tb-sep';
  bar.appendChild(imgSep);

  const imgBtn = document.createElement('button');
  imgBtn.type = 'button';
  imgBtn.className = 'da-tb-btn da-tb-image';
  imgBtn.title = 'Insert image';
  imgBtn.setAttribute('aria-label', 'Insert image');
  imgBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    openAssetsDialog();
  });
  const docPathAvailable = hasDocumentPath();
  if (!docPathAvailable) imgBtn.title = 'Open a document to insert images';
  bar.appendChild(imgBtn);

  function update(state) {
    const hasCursor = view.hasFocus() || docEditorFocused;
    select.disabled = !hasCursor;
    select.value = getActiveBlock(state);
    for (const { btn, key } of markBtns) {
      const markType = state.schema.marks[key];
      if (markType) {
        btn.classList.toggle('da-tb-active', hasCursor && isMarkActive(state, markType));
        btn.disabled = !hasCursor;
      }
    }
    const linkMarkType = state.schema.marks.link;
    const linkActive = !!(hasCursor && linkMarkType && isMarkActive(state, linkMarkType));
    if (linkMarkType) {
      linkBtn.classList.toggle('da-tb-active', linkActive);
      linkBtn.disabled = !hasCursor;
    }
    unlinkBtn.disabled = !hasCursor || !linkActive;
    imgBtn.disabled = !hasCursor || !docPathAvailable;
  }

  function destroy() {
    view.dom.removeEventListener('focus', onDocFocus);
    view.dom.removeEventListener('blur', onDocBlur);
  }

  return { bar, update, destroy };
}

export default function proseToolbar(onToolbar) {
  return new Plugin({
    view(editorView) {
      const { bar, update, destroy } = buildToolbar(editorView);
      onToolbar?.(bar);
      update(editorView.state);
      return {
        update(v) { update(v.state); },
        destroy() {
          destroy();
          bar.remove();
          onToolbar?.(null);
        },
      };
    },
  });
}
