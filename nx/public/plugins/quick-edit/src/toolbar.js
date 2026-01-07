import { linkItem, removeLinkItem } from 'https://main--da-live--adobe.aem.live/blocks/edit/prose/plugins/menu/linkItem.js';
import { renderGrouped } from 'https://main--da-live--adobe.aem.live/deps/da-y-wrapper/dist/index.js';

let floatingToolbar = null;
let currentEditorView = null;
let scrollListener = null;
let updateLinkMenu = null;

// Holds the web component stylesheet for the link editor.
let linkStylesheet = null;
async function loadLinkStylesheet() {
  if (linkStylesheet) return linkStylesheet;
  const resp = await fetch('https://main--da-live--adobe.aem.live/blocks/edit/da-palette/da-palette.css');
  const text = await resp.text();
  const sheet = new CSSStyleSheet();
  sheet.replace(text);
  linkStylesheet = sheet;
  return sheet;
}

// This reuses the DA code for link editing. Long term should use our own implementation,
// or make DA's more reusable without hacks.
function createLinkToolbar(view) {
  const { marks } = view.state.schema;
  const linkMenu = [linkItem(marks.link), removeLinkItem(marks.link)];

  const { dom, update } = renderGrouped(view, [linkMenu]);
  updateLinkMenu = update;

  // TODO: Super hacky. Modal code in da expects global window.view.
  window.view = view;
  // Also required by the modal.
  document.querySelector('.da-palettes')?.remove();
  const insertedElement = document.createElement('div');
  insertedElement.className = 'da-palettes';
  insertedElement.style.display = 'none';
  window.view.dom.parentNode.insertBefore(insertedElement, window.view.dom.nextSibling);
  
  // TODO: Super hacky.
  // We reuse the same link editor window from DA, and internally this expects window.view.dom.nextSibling
  // Leaving it there may break the css styling, because in our dom the project can have css that affects this.
  // So we leave it where it is until the da code has performed what it needs (add child), then move it away.
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Move the entire insertedElement to the end of document.body
        document.body.appendChild(insertedElement);
        observer.disconnect();
        loadLinkStylesheet().then((sheet) => {
          insertedElement.firstChild.shadowRoot.adoptedStyleSheets = [sheet];
          insertedElement.style.display = 'flex';
        });
      }
    });
  });
  
  // Start observing the element for child additions
  observer.observe(insertedElement, { childList: true });
  
  updateLinkMenu(view.state);

  return dom;
}

function createFloatingToolbar(view) {
  if (floatingToolbar) {
    floatingToolbar.querySelectorAll('.ProseMirror-menuitem').forEach(item => item.remove());
    const linkToolbar = createLinkToolbar(view);
    floatingToolbar.appendChild(linkToolbar);
    return floatingToolbar;
  };
  
  const toolbar = document.createElement('div');
  toolbar.className = 'prosemirror-floating-toolbar';
  
  const boldBtn = document.createElement('button');
  boldBtn.textContent = 'Bold';
  boldBtn.className = 'toolbar-btn toolbar-btn-bold';
  boldBtn.onmousedown = (e) => {
    e.preventDefault(); // Prevent focus loss
    toggleMark('strong');
  };
  
  const italicBtn = document.createElement('button');
  italicBtn.textContent = 'Italic';
  italicBtn.className = 'toolbar-btn toolbar-btn-italic';
  italicBtn.onmousedown = (e) => {
    e.preventDefault(); // Prevent focus loss
    toggleMark('em');
  };
  
  const underlineBtn = document.createElement('button');
  underlineBtn.textContent = 'Underline';
  underlineBtn.className = 'toolbar-btn toolbar-btn-underline';
  underlineBtn.onmousedown = (e) => {
    e.preventDefault(); // Prevent focus loss
    toggleMark('u');
  };
  
  toolbar.appendChild(boldBtn);
  toolbar.appendChild(italicBtn);
  toolbar.appendChild(underlineBtn);
  document.body.appendChild(toolbar);

  const linkToolbar = createLinkToolbar(view);
  toolbar.appendChild(linkToolbar);
  
  floatingToolbar = toolbar;
  return toolbar;
}

function toggleMark(markType) {
  if (!currentEditorView) return;
  
  const { state, dispatch } = currentEditorView;
  const { schema, selection, tr, storedMarks } = state;
  const mark = schema.marks[markType];
  
  if (!mark) return;
  
  if (selection.empty) {
    // No selection - toggle stored marks for future typing
    const activeMarks = storedMarks || selection.$from.marks();
    const hasMark = activeMarks.some(m => m.type === mark);
    
    if (hasMark) {
      dispatch(tr.removeStoredMark(mark));
    } else {
      dispatch(tr.addStoredMark(mark.create()));
    }
  } else {
    // Has selection - toggle mark on selected text
    const hasMark = state.doc.rangeHasMark(selection.from, selection.to, mark);
    
    if (hasMark) {
      dispatch(tr.removeMark(selection.from, selection.to, mark));
    } else {
      dispatch(tr.addMark(selection.from, selection.to, mark.create()));
    }
  }
}

function updateToolbarState() {
  if (!currentEditorView || !floatingToolbar) return;
  
  const { state } = currentEditorView;
  const { schema, selection, storedMarks } = state;
  
  // Get the marks at the current position (includes stored marks)
  const activeMarks = storedMarks || selection.$from.marks();
  
  // Update bold button
  const boldBtn = floatingToolbar.querySelector('.toolbar-btn-bold');
  const boldMark = schema.marks.strong;
  if (boldMark) {
    let hasBold = false;
    if (selection.empty) {
      // Check stored marks or marks at cursor position
      hasBold = activeMarks.some(m => m.type === boldMark);
    } else {
      // Check if the entire selection has the mark
      hasBold = state.doc.rangeHasMark(selection.from, selection.to, boldMark);
    }
    boldBtn.classList.toggle('active', hasBold);
  }
  
  // Update italic button
  const italicBtn = floatingToolbar.querySelector('.toolbar-btn-italic');
  const italicMark = schema.marks.em;
  if (italicMark) {
    let hasItalic = false;
    if (selection.empty) {
      // Check stored marks or marks at cursor position
      hasItalic = activeMarks.some(m => m.type === italicMark);
    } else {
      // Check if the entire selection has the mark
      hasItalic = state.doc.rangeHasMark(selection.from, selection.to, italicMark);
    }
    italicBtn.classList.toggle('active', hasItalic);
  }
  
  // Update underline button
  const underlineBtn = floatingToolbar.querySelector('.toolbar-btn-underline');
  const underlineMark = schema.marks.u;
  if (underlineMark) {
    let hasUnderline = false;
    if (selection.empty) {
      // Check stored marks or marks at cursor position
      hasUnderline = activeMarks.some(m => m.type === underlineMark);
    } else {
      // Check if the entire selection has the mark
      hasUnderline = state.doc.rangeHasMark(selection.from, selection.to, underlineMark);
    }
    underlineBtn.classList.toggle('active', hasUnderline);
  }

  updateLinkMenu(state);
}

function positionToolbar() {
  if (!floatingToolbar || !currentEditorView) return;
  
  const editorDom = currentEditorView.dom;
  const rect = editorDom.getBoundingClientRect();

  const top = Math.max(rect.top - floatingToolbar.offsetHeight - 8, 8);

  // Position toolbar above the editor
  floatingToolbar.style.position = 'fixed';
  floatingToolbar.style.left = `${rect.left}px`;
  floatingToolbar.style.top = `${top}px`;
  floatingToolbar.style.transform = 'none';
}

export function showToolbar(view) {
  const toolbar = createFloatingToolbar(view);
  toolbar.style.display = 'flex';
  
  // Wait for toolbar to render so we can measure its height
  requestAnimationFrame(() => {
    positionToolbar();
    updateToolbarState();
  });
  
  // Add scroll listener to reposition toolbar on scroll
  if (!scrollListener) {
    scrollListener = () => positionToolbar();
    window.addEventListener('scroll', scrollListener, true);
    window.addEventListener('resize', scrollListener);
  }
}

export function hideToolbar() {
  if (floatingToolbar) {
    floatingToolbar.style.display = 'none';
  }
  
  // Remove scroll listener
  if (scrollListener) {
    window.removeEventListener('scroll', scrollListener, true);
    window.removeEventListener('resize', scrollListener);
    scrollListener = null;
  }
}

export function setCurrentEditorView(view) {
  currentEditorView = view;
}

export function handleToolbarKeydown(event) {
  // Handle Ctrl+B for bold (Cmd+B on Mac)
  if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
    event.preventDefault();
    toggleMark('strong');
    return true;
  }
  // Handle Ctrl+I for italic (Cmd+I on Mac)
  if ((event.metaKey || event.ctrlKey) && event.key === 'i') {
    event.preventDefault();
    toggleMark('em');
    return true;
  }
  // Handle Ctrl+U for underline (Cmd+U on Mac)
  if ((event.metaKey || event.ctrlKey) && event.key === 'u') {
    event.preventDefault();
    toggleMark('u');
    return true;
  }
  return false;
}

export { updateToolbarState, positionToolbar };

