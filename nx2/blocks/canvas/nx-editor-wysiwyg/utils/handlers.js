import { TextSelection, yUndo, yRedo } from 'da-y-wrapper';
import { getActiveBlockFlatIndex } from './blocks.js';

export function handleCursorMove({ cursorOffset, textCursorOffset }, ctx) {
  const { view, wsProvider } = ctx;
  if (!view || !wsProvider) return;

  if (cursorOffset == null || textCursorOffset == null) {
    delete view.hasFocus;
    wsProvider.awareness.setLocalStateField('cursor', null);
    return;
  }

  const { state } = view;
  const position = cursorOffset + textCursorOffset;

  try {
    if (position < 0 || position > state.doc.content.size) {
      // eslint-disable-next-line no-console
      console.warn('Invalid cursor position:', position);
      return;
    }

    view.hasFocus = () => true;

    const { tr } = state;
    tr.setSelection(TextSelection.create(state.doc, position));

    // Sync stored marks so the toolbar reflects the marks active at the cursor.
    // Two problems this solves:
    // 1. ProseMirror clears storedMarks whenever selection.anchor changes, which
    //    happens on every cursor-move — that wipes toolbar-toggled marks before the
    //    first keystroke arrives.
    // 2. marksAcross() returns Mark.none when the cursor is at the end of a mark
    //    run (nothing to the right), so the toolbar shows the mark as inactive even
    //    though the text is marked.  nodeBefore/nodeAfter covers both sides.
    const $pos = state.doc.resolve(position);
    const marksBefore = $pos.nodeBefore?.marks;
    const marksAfter = $pos.nodeAfter?.marks;
    const marksAtCursor = (marksBefore?.length ? marksBefore : null)
      ?? (marksAfter?.length ? marksAfter : null);

    if (marksAtCursor) {
      // Cursor is adjacent to marked text — use those marks (handles Cmd+B case).
      tr.setStoredMarks(marksAtCursor);
    } else if (state.storedMarks?.length) {
      // No marked text at this position, but user explicitly toggled a mark via
      // the toolbar — preserve it so it survives cursor-move events before typing.
      tr.setStoredMarks(state.storedMarks);
    }

    ctx.suppressRerender = true;
    view.dispatch(tr.scrollIntoView());
    ctx.suppressRerender = false;
    ctx.onActiveBlockChange?.(getActiveBlockFlatIndex(view));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error moving cursor:', error);
  }
}

export function handleUndoRedo(data, ctx) {
  const { action } = data;
  const view = ctx?.view;
  if (!view) return;
  if (action === 'undo') {
    yUndo(view.state);
  } else if (action === 'redo') {
    yRedo(view.state);
  }
}

export async function handlePreview(ctx) {
  const path = ctx.path.endsWith('/') ? `${ctx.path}index` : `${ctx.path}`;
  const url = `https://admin.hlx.page/preview/${ctx.owner}/${ctx.repo}/main${path}`;
  const token = typeof ctx.getToken === 'function' ? await Promise.resolve(ctx.getToken()) : null;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(url, { method: 'POST', headers });

  if (!resp.ok) {
    ctx.port.postMessage({ type: 'preview', ok: false, error: `Failed to preview: ${resp.statusText}` });
  } else {
    ctx.port.postMessage({ type: 'preview', ok: true });
  }
}

/**
 * Sync stored marks from the WYSIWYG portal to the doc editor so the toolbar
 * reflects mark toggles (e.g. Cmd+B) made via keyboard in the portal immediately,
 * without waiting for a character to be typed.
 * @param {{ marks: object[] }} data - serialised ProseMirror mark JSON
 * @param {{ view: import('prosemirror-view').EditorView }} ctx
 */
export function handleStoredMarks({ marks }, ctx) {
  const { view } = ctx;
  if (!view) return;
  const { state } = view;
  const { schema } = state;
  try {
    const parsedMarks = marks
      .map((m) => {
        const markType = schema.marks[m.type];
        return markType ? markType.create(m.attrs) : null;
      })
      .filter(Boolean);
    const { tr } = state;
    tr.setStoredMarks(parsedMarks);
    ctx.suppressRerender = true;
    view.dispatch(tr);
    ctx.suppressRerender = false;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] handleStoredMarks failed', e?.message);
  }
}

export function handleSelectionChange({ anchor, head }, ctx) {
  const { view } = ctx;
  if (!view) return;
  const { state } = view;
  try {
    const a = Math.max(0, Math.min(anchor, state.doc.content.size));
    const h = Math.max(0, Math.min(head, state.doc.content.size));
    const { tr } = state;
    tr.setSelection(TextSelection.create(state.doc, a, h));
    ctx.suppressRerender = true;
    view.dispatch(tr);
    ctx.suppressRerender = false;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] handleSelectionChange failed', e?.message);
  }
}
