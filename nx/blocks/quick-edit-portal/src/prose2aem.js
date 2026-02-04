/* eslint-disable import/prefer-default-export */
import prose2aem from 'https://da.live/blocks/shared/prose2aem.js';

const EDITABLES = [
  { selector: 'h1', nodeName: 'H1' },
  { selector: 'h2', nodeName: 'H2' },
  { selector: 'h3', nodeName: 'H3' },
  { selector: 'h4', nodeName: 'H4' },
  { selector: 'h5', nodeName: 'H5' },
  { selector: 'h6', nodeName: 'H6' },
  { selector: 'p', nodeName: 'P' },
  { selector: 'ol', nodeName: 'OL' },
  { selector: 'ul', nodeName: 'UL' },
];
const EDITABLE_SELECTORS = EDITABLES.map((edit) => edit.selector).join(', ');

export function getInstrumentedHTML(view) {
  // Clone the editor first so we don't modify the real DOM
  const editorClone = view.dom.cloneNode(true);

  // Add data-prose-index attribute to all h1 elements with their starting position
  const originalElements = view.dom.querySelectorAll(EDITABLE_SELECTORS);
  const clonedElements = editorClone.querySelectorAll(EDITABLE_SELECTORS);

  originalElements.forEach((originalElement, index) => {
    if (clonedElements[index]) {
      try {
        // Get the ProseMirror position at the start of this editable element
        const editableElementStartPos = view.posAtDOM(originalElement, 0);
        clonedElements[index].setAttribute('data-prose-index', editableElementStartPos);
      } catch (e) {
        // If we can't find the position, skip this element
        // eslint-disable-next-line no-console
        console.warn('Could not find position for element:', e);
      }
    }
  });

  editorClone.querySelectorAll('table').forEach((table) => {
    const div = document.createElement('div');
    div.className = 'tableWrapper';
    table.insertAdjacentElement('afterend', div);
    div.append(table);
  });

  const remoteCursors = editorClone.querySelectorAll('.ProseMirror-yjs-cursor');

  remoteCursors.forEach((remoteCursor) => {
    // Find the highest-level ancestor with data-prose-index attribute
    let highestEditable = null;
    let current = remoteCursor.parentElement;

    while (current) {
      if (current.hasAttribute('data-prose-index')) {
        highestEditable = current;
      }
      current = current.parentElement;
    }

    if (highestEditable) {
      highestEditable.setAttribute('data-cursor-remote', remoteCursor.innerText);
      highestEditable.setAttribute('data-cursor-remote-color', remoteCursor.style['border-color']);
    }
  });

  // Convert to an HTML string using prose2aem
  return prose2aem(editorClone, true);
}
