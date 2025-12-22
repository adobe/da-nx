import {
  EditorState,
  EditorView,
  fixTables,
  NodeSelection, TextSelection, Plugin,
  Slice,
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from 'https://y-wrapper-update--da-live--hannessolo.aem.live/deps/da-y-wrapper/dist/index.js';
// import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition } from 'https://cdn.jsdelivr.net/npm/y-prosemirror@1.3.7/+esm';
import { Step } from 'https://cdn.jsdelivr.net/npm/prosemirror-transform@1.10.5/+esm'
import { getSchema } from 'https://main--da-live--adobe.aem.live/blocks/edit/prose/schema.js';
import { COLLAB_ORIGIN, DA_ORIGIN } from 'https://main--da-live--adobe.aem.live/blocks/shared/constants.js';
import { findChangedNodes, generateColor, getRelativeSelection, restoreRelativeSelection } from './utils.js';

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

let changesTracked = [];
let shouldTrack = false;
let syncing = false;
let initialized = false;
let stateSnapshot = null;
let ydoc = null;
let yXmlFragment = null;

export function syncTrackedChanges(data) {
  syncing = true;
  shouldTrack = false;
  
  if (!window.view) {
    changesTracked = [];
    shouldTrack = false;
    return;
  }

  const { view } = window;

  const tr = view.state.tr;

  console.log('stateSnapshot', stateSnapshot);
  const previousYState = ySyncPluginKey.getState(stateSnapshot);
  const ySyncState = ySyncPluginKey.getState(view.state);

  if (data.changes && Array.isArray(data.changes)) {
    data.changes.forEach((change) => {
      const { baseCursor, step: stepJSON } = change;
      
      // Convert step to JSON, add baseCursor offset to positions, and recreate
      // const stepJSON = step.toJSON();
      let mappedFrom = stepJSON.from !== undefined ? stepJSON.from + baseCursor : undefined;
      let mappedTo = stepJSON.to !== undefined ? stepJSON.to + baseCursor : undefined;

      const selection = TextSelection.create(stateSnapshot.doc, stepJSON.from, stepJSON.to);

      // Map offsets forward through all tracked changes
      const relative = getRelativeSelection(previousYState.binding.type, selection, previousYState?.binding.mapping);
      const restored = restoreRelativeSelection(relative, ydoc, yXmlFragment, ySyncState?.binding.mapping);
      console.log('relative', relative);
      console.log('restored', restored);

      mappedFrom = restored.from;
      mappedTo = restored.to;

      console.log('Mapped change:', {
        original: { from: stepJSON.from, to: stepJSON.to },
        withBaseCursor: { 
          from: stepJSON.from !== undefined ? stepJSON.from + baseCursor : undefined, 
          to: stepJSON.to !== undefined ? stepJSON.to + baseCursor : undefined 
        },
        mapped: { from: mappedFrom, to: mappedTo },
        stepType: stepJSON.stepType
      });

      const offsetStep = Step.fromJSON(view.state.schema, stepJSON);
      const slice = offsetStep.slice;
      const fixedSlice = new Slice(slice.content, 0, 0);
      tr.replace(mappedFrom, mappedTo, fixedSlice);
    });
  }

  view.dispatch(tr);
  
  syncing = false;
  changesTracked = [];
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
            // TODO consider adding this break back, to find the nearest.
            // Problem is, for ul we can have ul > p where we want the ul.
            // break;
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
    state: {
      init() {
        shouldTrack = false;
      },
      apply(tr, old) {
        if (!syncing) {
          changesTracked.push(tr);
        }
      }
    },
    view() {
      return {
        update(view, prevState) {
          if (syncing) {
            return;
          }
          const docChanged = view.state.doc !== prevState.doc;
          if (docChanged) {
            // Find changed nodes
            const changes = findChangedNodes(prevState.doc, view.state.doc);
            if (changes.length > 0) {
              // Check if all changes share a common editable ancestor
              const commonEditable = findCommonEditableAncestor(view, changes);
              if (commonEditable && initialized) {
                // All changes are within a single editable element
                getEditor?.({ cursorOffset: commonEditable.pos + 1 });
              } else if (!initialized) {
                initialized = true;
                rerenderPage?.();
              } else {
                if (!shouldTrack) {
                  shouldTrack = true;
                  stateSnapshot = view.state;
                }
                rerenderPage?.();
              }
            }
          }

          if (!shouldTrack) {
            changesTracked = [];
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

  ydoc = new Y.Doc();

  const server = COLLAB_ORIGIN;
  const roomName = `${DA_ORIGIN}${new URL(path).pathname}`;

  const opts = {};

  if (window.adobeIMS?.isSignedInUser()) {
    opts.params = { Authorization: `Bearer ${window.adobeIMS.getAccessToken().token}` };
  }

  const canWrite = permissions.some((permission) => permission === 'write');

  const wsProvider = new WebsocketProvider(server, roomName, ydoc, opts);

  registerErrorHandler(ydoc);

  yXmlFragment = ydoc.getXmlFragment('prosemirror');

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

//   ydoc.on('update', () => {
//     // // console.log(yDocToProsemirrorJSON(ydoc));
//     // const ySyncState = ySyncPluginKey.getState(window.view.state);
//     // if (!ySyncState) return;

//     // if (previousRelativeSelection) {
//     //   console.log('ySyncState', ySyncState);

//     //   console.log('previousRelativeSelection', previousRelativeSelection);
//     //   console.log('mapping', plugins[0].spec.state.init().binding.mapping);
//     //   const restored = restoreRelativeSelection(previousRelativeSelection, ydoc, yXmlFragment, ySyncState?.binding.mapping);
//     //   console.log('restored', restored);
//     // }
//     // previousRelativeSelection = getRelativeSelection(yXmlFragment, window.view.state, ySyncState?.binding.mapping);

//     if (previousState) {
// // console.log('previous YXL', previousYXMLFragment.toString())
// console.log('current YXL', yXmlFragment.toString())


//       const previousYState = ySyncPluginKey.getState(previousState);
//       console.log('previousYState', previousYState);
//       console.log('previousYState binding type', previousYState.binding.type.toString());

//       const relative = getRelativeSelection(previousYState.binding.type, previousState, previousYState?.binding.mapping);
//       console.log('relative', relative);

//       const ySyncState = ySyncPluginKey.getState(window.view.state);
//       console.log('ySyncState', ySyncState);
//       console.log('ySyncState type', ySyncState.binding.type.toString());
//       const restored = restoreRelativeSelection(relative, ydoc, yXmlFragment, ySyncState?.binding.mapping);
//       console.log('restored', restored);
//     }
//     previousState = window.view.state;
//     // yjsSnapshot = ydoc.createSnapshot();
//   });

  return { proseEl: editor, wsProvider };
}

