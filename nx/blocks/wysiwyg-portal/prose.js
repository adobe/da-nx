import {
  EditorState,
  EditorView,
  fixTables,
  NodeSelection,
  Plugin,
  Y,
  WebsocketProvider,
  ySyncPlugin,
} from 'https://main--da-live--adobe.aem.live/deps/da-y-wrapper/dist/index.js';
import { getSchema } from 'https://main--da-live--adobe.aem.live/blocks/edit/prose/schema.js';
import { COLLAB_ORIGIN, DA_ORIGIN } from 'https://main--da-live--adobe.aem.live/blocks/shared/constants.js';
import { findChangedNodes, generateColor } from './utils.js';

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

function trackCursorAndChanges(rerenderPage, updateText) {
  let updateTimeout = null;
  let pendingTextChanges = [];

  const scheduleTextUpdates = (textChanges) => {
    if (updateTimeout) clearTimeout(updateTimeout);
    
    // Accumulate text changes
    pendingTextChanges = textChanges;

    updateTimeout = setTimeout(() => {
      // Call updateText for each text change
      pendingTextChanges.forEach((change) => {
        updateText?.(change.newText, change.pos);
      });
      pendingTextChanges = [];
      updateTimeout = null;
    }, 500);
  };

  const schedulePageRerender = () => {
    if (updateTimeout) clearTimeout(updateTimeout);
    
    pendingTextChanges = [];

    updateTimeout = setTimeout(() => {
      rerenderPage?.();
      updateTimeout = null;
    }, 500);
  };

  return new Plugin({
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;

          if (docChanged) {
            // Traverse tree and find changed nodes
            const changes = findChangedNodes(prevState.doc, view.state.doc);
            
            if (changes.length > 0) {
              // Check if all changes are text-only changes
              const allTextChanges = changes.every((change) => change.type === 'text');

              if (allTextChanges) {
                // All changes are text - schedule debounced text updates
                scheduleTextUpdates(changes);
              } else {
                // Mixed or non-text changes - schedule page rerender
                schedulePageRerender();
              }
            }
            return;
          }
        },
      };
    },
  });
}

export default function initProse({ path, permissions, rerenderPage, updateText }) {
  // Destroy ProseMirror if it already exists - GH-212
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
    trackCursorAndChanges(rerenderPage, updateText),
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

