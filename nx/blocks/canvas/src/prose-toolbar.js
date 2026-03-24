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
  const displayText = text?.trim() || newHref;

  if (!newHref) return;

  let { tr } = state;
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

function setOkEnabled(enabled) {
  if (okBtn) okBtn.disabled = !enabled;
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
      .da-link-dialog-fields sp-textfield {
        width: 100%;
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

  hrefField = document.createElement('sp-textfield');
  hrefField.setAttribute('label', 'URL');
  hrefField.setAttribute('placeholder', 'https://...');

  textField = document.createElement('sp-textfield');
  textField.setAttribute('label', 'Display text');
  textField.setAttribute('placeholder', 'Enter display text');

  titleField = document.createElement('sp-textfield');
  titleField.setAttribute('label', 'Title');
  titleField.setAttribute('placeholder', 'title');

  fieldGroup.append(hrefField, textField, titleField);

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
    if (hrefField.value?.trim()) pendingConfirm?.();
    pendingConfirm = null;
    closeLinkDialog();
  });

  footer.append(cancelBtn, okBtn);
  linkDialogEl.append(heading, divider, fieldGroup, footer);
  // Append inside sp-theme so Spectrum CSS custom properties are inherited
  (document.querySelector('sp-theme') ?? document.body).appendChild(linkDialogEl);

  textField.addEventListener('input', () => setOkEnabled(!!textField.value?.trim()));

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

  // Enter submits when URL is filled
  linkDialogEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && hrefField.value?.trim()) {
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
  } else {
    const selText = state.selection.empty ? '' : state.doc.textBetween(rangeStart, rangeEnd);
    const trimmed = selText.trim();
    textField.value = selText;
    hrefField.value = /^(https?|mailto):/.test(trimmed) ? trimmed : '';
    titleField.value = '';
  }

  setOkEnabled(!!textField.value?.trim());
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

  function update(state) {
    select.value = getActiveBlock(state);
    for (const { btn, key } of markBtns) {
      const markType = state.schema.marks[key];
      if (markType) {
        btn.classList.toggle('da-tb-active', isMarkActive(state, markType));
      }
    }
    const linkMarkType = state.schema.marks.link;
    if (linkMarkType) {
      linkBtn.classList.toggle('da-tb-active', isMarkActive(state, linkMarkType));
    }
  }

  return { bar, update };
}

export default function proseToolbar(onToolbar) {
  return new Plugin({
    view(editorView) {
      const { bar, update } = buildToolbar(editorView);
      onToolbar?.(bar);
      update(editorView.state);
      return {
        update(v) { update(v.state); },
        destroy() { bar.remove(); onToolbar?.(null); },
      };
    },
  });
}
