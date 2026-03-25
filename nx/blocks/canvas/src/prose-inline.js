/**
 * ProseMirror + Yjs collab editor. withToolbar adds the horizontal formatting
 * toolbar and editing plugins (input rules, keyboard shortcuts, table editing).
 *
 * columnResizing() is intentionally omitted: it uses prosemirror-tables TableView
 * (div.tableWrapper around tables) and breaks quick-edit getInstrumentedHTML → prose2aem
 * → WYSIWYG iframe. Tables still work via tableEditing.
 */
/* eslint-disable import/no-unresolved */
import {
  EditorState,
  EditorView,
  fixTables,
  keymap,
  baseKeymap,
  Plugin,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  yUndoPluginKey,
  yUndo,
  yRedo,
  buildKeymap,
  tableEditing,
  gapCursor,
  liftListItem,
  sinkListItem,
} from 'da-y-wrapper';

import { getSchema } from 'da-parser';
import { COLLAB_ORIGIN, DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import { initIms } from '../../../utils/daFetch.js';
import { findChangedNodes, findCommonEditableAncestor } from './prose-controller-utils.js';
import proseToolbar from './prose-toolbar.js';
import tableSelectHandle from './table-select-handle.js';
import addToChatHandle from './add-to-chat-handle.js';
/* eslint-enable import/no-unresolved */

function trackCursorAndChanges(rerenderPage, updateCursors, getEditor, onSelectionChange) {
  return new Plugin({
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;

          if (docChanged) {
            const changes = findChangedNodes(prevState.doc, view.state.doc);

            if (changes.length > 0) {
              const commonEditable = findCommonEditableAncestor(view, changes, prevState);

              if (commonEditable) {
                getEditor?.({ cursorOffset: commonEditable.pos + 1 });
              } else {
                rerenderPage?.();
              }
            }
          }

          updateCursors?.();

          if (view.state.selection !== prevState.selection) {
            onSelectionChange?.(view);
          }
        },
      };
    },
  });
}

function registerErrorHandler(ydoc) {
  ydoc.on('update', () => {
    const errorMap = ydoc.getMap('error');
    if (errorMap && errorMap.size > 0) {
      // eslint-disable-next-line no-console
      console.log('Error from server', JSON.stringify(errorMap));
      errorMap.clear();
    }
  });
}

function generateColor(name, hRange = [0, 360], sRange = [60, 80], lRange = [40, 60]) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const normalizeHash = (min, max) => Math.floor((hash % (max - min)) + min);
  const h = normalizeHash(hRange[0], hRange[1]);
  const s = normalizeHash(sRange[0], sRange[1]);
  const l = normalizeHash(lRange[0], lRange[1]) / 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function addSyncedListener(wsProvider, canWrite, setEditable) {
  const handleSynced = (isSynced) => {
    if (isSynced) {
      if (canWrite && typeof setEditable === 'function') {
        setEditable(true);
      }
      wsProvider.off('synced', handleSynced);
    }
  };
  wsProvider.on('synced', handleSynced);
}

async function getCollabIdentity() {
  try {
    const ims = await initIms();
    const name = ims?.displayName?.trim();
    const id = ims?.userId || ims?.email;
    if (name && id) {
      return {
        name,
        id,
        colorSeed: ims?.email || ims?.userId || name,
      };
    }
  } catch {
    // Ignore IMS failures and use anonymous fallback below.
  }
  return null;
}

/**
 * Initialize ProseMirror + Yjs for the given document path.
 * getToken: () => token — used for WebSocket auth (required, no adobeIMS).
 * Optional rerenderPage, updateCursors, getEditor enable quick-edit controller mode
 * (trackCursorAndChanges). withToolbar adds da-live-style toolbar and edit plugins.
 * @param {{ path: string, permissions: string[], setEditable?: (editable: boolean) => void,
 *   getToken?: () => string, rerenderPage?: () => void, updateCursors?: () => void,
 *   getEditor?: (data: { cursorOffset: number }) => void, withToolbar?: boolean,
 *   onToolbar?: (el: HTMLElement | null) => void }} opts
 * @returns {Promise<{ proseEl: HTMLElement, wsProvider: WebsocketProvider, view: EditorView }>}
 */
export default async function initProse({
  path, permissions, setEditable, getToken,
  rerenderPage, updateCursors, getEditor, onSelectionChange,
  withToolbar = false, onToolbar, onAddToChat,
}) {
  if (window.view && !window.view.destroyed) {
    window.view.destroy();
  }
  delete window.view;

  const editor = document.createElement('div');
  editor.className = 'da-prose-mirror';
  editor.setAttribute('data-gramm', 'false');
  editor.setAttribute('data-gramm_editor', 'false');

  const schema = getSchema();
  const ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = { protocols: ['yjs'] };
  if (typeof getToken === 'function') {
    const t = getToken();
    if (t) opts.params = { Authorization: `Bearer ${t}` };
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, opts);
  wsProvider.maxBackoffTime = 30000;

  addSyncedListener(wsProvider, canWrite, setEditable);
  registerErrorHandler(ydoc);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  const identity = await getCollabIdentity();
  if (typeof getToken === 'function' && getToken() && identity) {
    wsProvider.awareness.setLocalStateField('user', {
      color: generateColor(identity.colorSeed),
      name: identity.name,
      id: identity.id,
    });
  } else {
    wsProvider.awareness.setLocalStateField('user', {
      color: generateColor(`${wsProvider.awareness.clientID}`),
      name: 'Anonymous',
      id: `anonymous-${wsProvider.awareness.clientID}`,
    });
  }

  const plugins = [
    ySyncPlugin(yXmlFragment),
    yCursorPlugin(wsProvider.awareness),
    yUndoPlugin(),
    keymap(baseKeymap),
  ];

  if (withToolbar && canWrite) {
    /* eslint-disable import/no-unresolved */
    const [
      {
        getEnterInputRulesPlugin,
        getURLInputRulesPlugin,
        getListInputRulesPlugin,
        handleTableBackspace,
        handleTableTab,
      },
      { getHeadingKeymap },
    ] = await Promise.all([
      import('https://da.live/blocks/edit/prose/plugins/keyHandlers.js'),
      import('https://da.live/blocks/edit/prose/plugins/menu/menu.js'),
    ]);
    /* eslint-enable import/no-unresolved */

    const dispatch = (tr) => { if (window.view) window.view.dispatch(tr); };

    const handleUndo = (state) => {
      const mgr = yUndoPluginKey.getState(state)?.undoManager;
      if (mgr?.undoStack?.length > 0) {
        mgr.undo();
        return true;
      }
      return yUndo(state) || false;
    };
    const handleRedo = (state) => {
      const mgr = yUndoPluginKey.getState(state)?.undoManager;
      if (mgr?.redoStack?.length > 0) {
        mgr.redo();
        return true;
      }
      return yRedo(state) || false;
    };

    plugins.push(
      proseToolbar(onToolbar),
      tableSelectHandle(),
      getEnterInputRulesPlugin(dispatch),
      getURLInputRulesPlugin(),
      getListInputRulesPlugin(schema),
      keymap(buildKeymap(schema)),
      keymap({ Backspace: handleTableBackspace }),
      keymap({
        'Mod-z': handleUndo,
        'Mod-y': handleRedo,
        'Mod-Shift-z': handleRedo,
        ...getHeadingKeymap(schema),
      }),
      keymap({
        Tab: handleTableTab(1),
        'Shift-Tab': handleTableTab(-1),
      }),
      keymap({
        Tab: sinkListItem(schema.nodes.list_item),
        'Shift-Tab': liftListItem(schema.nodes.list_item),
      }),
      gapCursor(),
      tableEditing({ allowTableNodeSelection: true }),
    );
  }

  if (withToolbar && typeof onAddToChat === 'function') {
    plugins.push(addToChatHandle(onAddToChat));
  }

  if (typeof rerenderPage === 'function' && typeof updateCursors === 'function' && typeof getEditor === 'function') {
    plugins.push(trackCursorAndChanges(rerenderPage, updateCursors, getEditor, onSelectionChange));
  }

  let state = EditorState.create({ schema, plugins });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  window.view = new EditorView(editor, {
    state,
    editable() { return canWrite; },
  });

  return { proseEl: editor, wsProvider, view: window.view };
}
