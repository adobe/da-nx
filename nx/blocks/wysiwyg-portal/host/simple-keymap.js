import { Plugin } from 'https://main--da-live--adobe.aem.live/deps/da-y-wrapper/dist/index.js';

function handleListItem(view, event) {
  const { state, dispatch } = view;
  const { selection, schema } = state;
  const { $from } = selection;
  
  // Check if we're in a list item
  const listItemType = schema.nodes.list_item;
  const paragraphType = schema.nodes.paragraph;
  
  // Find if we're inside a list item
  let depth = $from.depth;
  let listItemDepth = null;
  let paragraphDepth = null;
  
  for (let d = depth; d > 0; d--) {
    if (listItemType && $from.node(d).type === listItemType && listItemDepth === null) {
      listItemDepth = d;
    }
    if (paragraphType && $from.node(d).type === paragraphType && paragraphDepth === null) {
      paragraphDepth = d;
    }
  }
  
  // Handle list items
  if (listItemDepth !== null) {
    const listItem = $from.node(listItemDepth);
    const listItemPos = $from.before(listItemDepth);
    
    // Handle Enter key - create new list item
    if (event.key === 'Enter') {
      event.preventDefault();
      
      // Create a new empty list item
      const newListItem = listItemType.create(null, schema.nodes.paragraph.create());
      
      // Insert the new list item after the current one
      const tr = state.tr;
      const insertPos = listItemPos + listItem.nodeSize;
      
      tr.insert(insertPos, newListItem);
      
      // Move cursor to the new list item
      tr.setSelection(state.selection.constructor.near(tr.doc.resolve(insertPos + 1)));
      
      dispatch(tr);
      return true;
    }
    
    // Handle Backspace key - delete empty list item
    if (event.key === 'Backspace') {
      // Check if cursor is at the start of the list item
      const listItemStart = $from.start(listItemDepth);
      const cursorPos = $from.pos;
      
      if (cursorPos !== listItemStart + 1) {
        // Not at the start, let default behavior handle it
        return false;
      }
      
      // Check if the list item is empty
      const isEmpty = listItem.textContent.trim() === '';
      
      if (!isEmpty) {
        // Not empty, let default behavior handle it
        return false;
      }
      
      event.preventDefault();
      
      const tr = state.tr;
      const listDepth = listItemDepth - 1;
      const listNode = $from.node(listDepth);
      
      // Check if this is the only item in the list
      if (listNode.childCount === 1) {
        return false;
      }

      // Delete just this list item
      tr.delete(listItemPos, listItemPos + listItem.nodeSize);
        
      // Position cursor in the previous list item if it exists
      if (listItemPos > $from.before(listDepth) + 1) {
        tr.setSelection(state.selection.constructor.near(tr.doc.resolve(listItemPos - 1)));
      } else {
        // If this was the first item, position in the next item
        tr.setSelection(state.selection.constructor.near(tr.doc.resolve(listItemPos + 1)));
      }
      
      dispatch(tr);
      return true;
    }
  }
  
  return false;
}

function handleUndoRedo(view, event, port) {
  // Handle Ctrl+Z (undo) and Ctrl+Shift+Z (redo)
  if (event.ctrlKey || event.metaKey) {
    if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      
      const action = event.shiftKey ? 'redo' : 'undo';
      
      port.postMessage({
        type: 'history',
        action
      });
      
      return true;
    }
  }
  
  return false;
}

export function createSimpleKeymap(port) {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {        
        const listItemHandled = handleListItem(view, event);
        if (listItemHandled) return true;

        const undoRedoHandled = handleUndoRedo(view, event, port);
        if (undoRedoHandled) return true;

        return false;
      }
    }
  });
}

