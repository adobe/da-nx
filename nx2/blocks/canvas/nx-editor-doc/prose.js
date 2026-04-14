/* eslint-disable import/no-unresolved -- importmap + da.live prose plugins */
import {
  EditorState,
  EditorView,
  fixTables,
  keymap,
  baseKeymap,
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
import { COLLAB_ORIGIN, DA_ORIGIN } from '../../../utils/daFetch.js';
import { generateColor, getCollabIdentity } from './utils/collab.js';

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

export default async function initProse({
  path, permissions, setEditable, getToken,
  extraPlugins = [],
}) {
  const editor = document.createElement('div');
  editor.className = 'da-prose-mirror';
  editor.setAttribute('data-gramm', 'false');
  editor.setAttribute('data-gramm_editor', 'false');

  const schema = getSchema();
  const ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const wsOpts = { protocols: ['yjs'] };
  if (typeof getToken === 'function') {
    const t = getToken();
    if (t) wsOpts.params = { Authorization: `Bearer ${t}` };
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, wsOpts);
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

  /** @type {import('prosemirror-view').EditorView | null} */
  let viewRef = null;

  if (canWrite) {
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

    const dispatch = (tr) => {
      if (viewRef) viewRef.dispatch(tr);
    };

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

  if (extraPlugins.length > 0) {
    plugins.push(...extraPlugins);
  }

  let state = EditorState.create({ schema, plugins });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  viewRef = new EditorView(editor, {
    state,
    editable() { return canWrite; },
  });

  return { proseEl: editor, wsProvider, view: viewRef, ydoc };
}
