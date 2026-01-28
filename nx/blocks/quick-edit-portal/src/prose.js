import {
  EditorState,
  EditorView,
  fixTables,
  Plugin,
  NodeSelection,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  keymap,
  buildKeymap,
  baseKeymap,
  tableEditing,
  columnResizing,
  liftListItem,
  sinkListItem,
  gapCursor,
} from 'da-y-wrapper';
import { getSchema } from 'https://da.live/blocks/edit/prose/schema.js';
import { COLLAB_ORIGIN, DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import codemark from 'https://da.live/blocks/edit/prose/plugins/codemark.js';
import imageDrop from 'https://da.live/blocks/edit/prose/plugins/imageDrop.js';
import linkConverter from 'https://da.live/blocks/edit/prose/plugins/linkConverter.js';
import sectionPasteHandler from 'https://da.live/blocks/edit/prose/plugins/sectionPasteHandler.js';
import base64Uploader from 'https://da.live/blocks/edit/prose/plugins/base64uploader.js';
import { findChangedNodes, generateColor, findCommonEditableAncestor } from './utils.js';
import menu, { getHeadingKeymap } from './plugins/menu.js';
import toggleLibrary from './plugins/library.js';
import { linkItem } from './plugins/linkItem.js';
import {
  handleTableBackspace,
  handleTableTab,
  getEnterInputRulesPlugin,
  getURLInputRulesPlugin,
  handleUndo,
  handleRedo,
} from './plugins/keyHandlers.js';

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

function trackCursorAndChanges(rerenderPage, updateCursors, getEditor, enableFullEditor, ctx) {
  let lastCursorPos = null;
  let lastBlockPos = null;

  const getBlockPosition = (state, pos) => {
    // Resolve the position to get context about where it is in the document
    const $pos = state.doc.resolve(pos);

    // Find the depth of the nearest block-level node
    // Start from the deepest position and walk up to find a block
    for (let d = $pos.depth; d > 0; d -= 1) {
      const node = $pos.node(d);
      if (node.isBlock) {
        // Return the position before this block node
        return $pos.before(d);
      }
    }

    // Fallback to the position itself
    return pos;
  };

  return new Plugin({
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;

          if (docChanged) {
            // Find changed nodes
            const changes = findChangedNodes(prevState.doc, view.state.doc);

            if (changes.length > 0) {
              // Check if all changes share a common editable ancestor
              const commonEditable = findCommonEditableAncestor(view, changes, prevState);

              if (commonEditable) {
                // All changes are within a single editable element
                getEditor?.({ cursorOffset: commonEditable.pos + 1 });
              } else {
                // TODO don't force this, let the user decide when.
                rerenderPage?.();
              }
            }
          }

          updateCursors?.();

          // In side-by-side mode, track cursor position for scroll-to behavior
          if (enableFullEditor && ctx?.port) {
            const { from, to } = view.state.selection;
            const isNodeSelection = view.state.selection instanceof NodeSelection;

            // Don't update during text selection (when from !== to),
            // but allow node selections (like images)
            if (from !== to && !isNodeSelection) return;

            const currentPos = `${from}-${to}`;
            const currentBlockPos = getBlockPosition(view.state, from);

            // Only update if cursor position actually changed
            if (currentPos !== lastCursorPos) {
              // Only scroll to position if:
              // 1. We had a lastCursorPos (not the first position)
              // 2. AND the block changed (moved to a different block/row)
              if (lastCursorPos && currentBlockPos !== lastBlockPos) {
                // Send message to parent to scroll to this position
                ctx.port.postMessage({ 
                  type: 'scroll-to-position', 
                  position: currentBlockPos 
                });
              }
              lastCursorPos = currentPos;
              lastBlockPos = currentBlockPos;
            }
          }
        },
      };
    },
  });
}

export default function initProse({ path, permissions, rerenderPage, updateCursors, getEditor, enableFullEditor = false, ctx = null }) {
  // Destroy ProseMirror if it already exists
  if (window.view) {
    window.view.destroy();
    delete window.view;
  }
  const editor = document.createElement('div');
  editor.className = 'da-prose-mirror';

  const schema = getSchema();

  const ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = {};

  if (window.adobeIMS?.isSignedInUser()) {
    opts.params = { Authorization: `Bearer ${window.adobeIMS.getAccessToken().token}` };
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, opts);

  registerErrorHandler(ydoc);

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  if (window.adobeIMS?.isSignedInUser()) {
    window.adobeIMS.getProfile().then((profile) => {
      wsProvider.awareness.setLocalStateField('user', {
        color: generateColor(profile.email || profile.userId),
        name: profile.displayName,
        id: profile.userId,
      });
    });
  } else {
    wsProvider.awareness.setLocalStateField('user', {
      color: generateColor(`${wsProvider.awareness.clientID}`),
      name: 'Anonymous',
      id: `anonymous-${wsProvider.awareness.clientID}}`,
    });
  }

  const plugins = [
    ySyncPlugin(yXmlFragment),
    yCursorPlugin(wsProvider.awareness),
    yUndoPlugin(),
    trackCursorAndChanges(rerenderPage, updateCursors, getEditor, enableFullEditor, ctx),
  ];

  // Conditionally add full editor plugins when side-by-side mode is enabled
  if (enableFullEditor) {
    // Create a simple dispatch function for input rules
    function dispatchTransaction(transaction) {
      if (!window.view) return;
      const newState = window.view.state.apply(transaction);
      window.view.updateState(newState);
    }

    plugins.push(
      // Core editing plugins (must come before keymaps)
      imageDrop(schema),
      linkConverter(schema),
      sectionPasteHandler(schema),
      base64Uploader(schema),
      columnResizing(),
      // Input rules for URLs and section breaks
      getEnterInputRulesPlugin(dispatchTransaction),
      getURLInputRulesPlugin(),
      // Build standard ProseMirror keymaps (in this specific order!)
      keymap(buildKeymap(schema)),
      keymap({ Backspace: handleTableBackspace }),
      keymap(baseKeymap),
      // Code mark plugin
      codemark(),
      // Custom keymaps for DA editor (must come AFTER baseKeymap)
      keymap({
        'Mod-z': handleUndo,
        'Mod-y': handleRedo,
        'Mod-Shift-z': handleRedo,
        'Mod-Shift-l': toggleLibrary,
        'Mod-k': (state, dispatch, view) => {
          const linkMarkType = state.schema.marks.link;
          const linkMenuItem = linkItem(linkMarkType);
          return linkMenuItem.spec.run(state, dispatch, view);
        },
        ...getHeadingKeymap(schema),
      }),
      // Table navigation keymaps
      keymap({
        Tab: handleTableTab(1),
        'Shift-Tab': handleTableTab(-1),
      }),
      // List indentation keymaps
      keymap({
        Tab: sinkListItem(schema.nodes.list_item),
        'Shift-Tab': liftListItem(schema.nodes.list_item),
      }),
      // Table editing plugins
      gapCursor(),
      tableEditing(),
      // Menu plugin (toolbar)
      menu,
    );
  }

  let state = EditorState.create({ schema, plugins });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  window.view = new EditorView(editor, {
    state,
    editable() { return canWrite; },
  });

  return { proseEl: editor, wsProvider, view };
}

