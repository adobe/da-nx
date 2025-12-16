import {
  EditorState,
  EditorView,
  fixTables,
  NodeSelection,
  Plugin,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
} from 'https://main--da-live--adobe.aem.live/deps/da-y-wrapper/dist/index.js';
import { getSchema } from 'https://main--da-live--adobe.aem.live/blocks/edit/prose/schema.js';
import { COLLAB_ORIGIN, DA_ORIGIN } from 'https://main--da-live--adobe.aem.live/blocks/shared/constants.js';
import { findChangedNodes, generateColor } from './utils.js';

const EDITABLE_TYPES = ['heading', 'paragraph', 'ordered_list', 'bullet_list'];

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

function trackCursorAndChanges(rerenderPage, updateCursors, getEditor) {
  // Find the common editable ancestor for all changed nodes
  function findCommonEditableAncestor(view, changes) {
    if (changes.length === 0) return null;

    // For each change, find its editable ancestor
    const editableAncestors = [];
    
    for (const change of changes) {
      try {
        const $pos = view.state.doc.resolve(change.pos);
        let editableAncestor = null;
        
        // Walk up the tree to find an editable node
        for (let depth = $pos.depth; depth > 0; depth--) {
          const node = $pos.node(depth);
          if (EDITABLE_TYPES.includes(node.type.name)) {
            editableAncestor = {
              node,
              pos: $pos.before(depth),
            };
            break;
          }
        }
        
        if (editableAncestor) {
          editableAncestors.push(editableAncestor);
        } else {
          // If any change doesn't have an editable ancestor, return null
          return null;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not resolve position for change:', e);
        return null;
      }
    }

    // Check if all changes share the same editable ancestor
    if (editableAncestors.length === 0) return null;
    
    const firstPos = editableAncestors[0].pos;
    const allSameAncestor = editableAncestors.every((ancestor) => ancestor.pos === firstPos);
    
    return allSameAncestor ? editableAncestors[0] : null;
  }

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
              const commonEditable = findCommonEditableAncestor(view, changes);

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
        },
      };
    },
  });
}

export default function initProse({ path, permissions, rerenderPage, updateCursors, getEditor }) {
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
    trackCursorAndChanges(rerenderPage, updateCursors, getEditor),
  ];

  let state = EditorState.create({ schema, plugins });

  const fix = fixTables(state);
  if (fix) state = state.apply(fix.setMeta('addToHistory', false));

  window.view = new EditorView(editor, {
    state,
    editable() { return canWrite; },
  });

  return { proseEl: editor, wsProvider };
}

