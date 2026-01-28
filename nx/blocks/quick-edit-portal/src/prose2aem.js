// Local copy of prose2aem to have better control and debugging

function toBlockCSSClassNames(text) {
  if (!text) return [];
  const names = [];
  const idx = text.lastIndexOf('(');
  if (idx >= 0) {
    names.push(text.substring(0, idx));
    names.push(...text.substring(idx + 1).split(','));
  } else {
    names.push(text);
  }

  return names.map((name) => name
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, ''))
    .filter((name) => !!name);
}

function convertBlocks(editor, isFragment = false) {
  const tables = editor.querySelectorAll('.tableWrapper > table, da-diff-added > table');

  tables.forEach((table) => {
    const tbody = table.querySelector(':scope > tbody');
    const rows = tbody ? [...tbody.querySelectorAll(':scope > tr')] : [...table.querySelectorAll(':scope > tr')];
    const nameRow = rows.shift();
    const divs = [...rows].map((row) => {
      const cols = row.querySelectorAll(':scope > td');
      // eslint-disable-next-line no-shadow
      const divs = [...cols].map((col) => {
        const { innerHTML } = col;
        const div = document.createElement('div');
        div.innerHTML = innerHTML;
        return div;
      });
      const div = document.createElement('div');
      div.append(...divs);
      return div;
    });

    const div = document.createElement('div');
    div.className = toBlockCSSClassNames(nameRow.textContent).join(' ');
    div.append(...divs);

    if (isFragment) {
      table.parentElement.replaceChild(div, table);
    } else {
      table.parentElement.parentElement.replaceChild(div, table.parentElement);
    }
  });
}

function makePictures(editor) {
  const imgs = editor.querySelectorAll('img');
  imgs.forEach((img) => {
    img.removeAttribute('contenteditable');
    img.removeAttribute('draggable');
    img.removeAttribute('style');

    const dataFocalX = img.getAttribute('data-focal-x');
    const dataFocalY = img.getAttribute('data-focal-y');
    if (dataFocalX && dataFocalY) {
      img.setAttribute('data-title', `data-focal:${dataFocalX},${dataFocalY}`);
    }

    if (img.parentElement.classList.contains('focal-point-image-wrapper')) {
      const wrapper = img.parentElement;
      wrapper.parentElement.replaceChild(img, wrapper);
    }

    const clone = img.cloneNode(true);
    clone.setAttribute('loading', 'lazy');

    let pic = document.createElement('picture');

    const srcMobile = document.createElement('source');
    srcMobile.srcset = clone.src;

    const srcTablet = document.createElement('source');
    srcTablet.srcset = clone.src;
    srcTablet.media = '(min-width: 600px)';

    pic.append(srcMobile, srcTablet, clone);

    const hrefAttr = img.getAttribute('href');
    if (hrefAttr) {
      const a = document.createElement('a');
      a.href = hrefAttr;
      const titleAttr = img.getAttribute('title');
      if (titleAttr) {
        a.title = titleAttr;
      }
      a.append(pic);
      pic = a;
    }

    // Determine what to replace
    const imgParent = img.parentElement;
    const imgGrandparent = imgParent.parentElement;
    if (imgParent.nodeName === 'P' && imgGrandparent?.childElementCount === 1) {
      imgGrandparent.replaceChild(pic, imgParent);
    } else {
      imgParent.replaceChild(pic, img);
    }
  });
}

function convertParagraphs(editor) {
  const paras = editor.querySelectorAll(':scope > p');
  paras.forEach((p) => {
    // Remove empty p tags
    if (p.innerHTML.trim() === '') { p.remove(); }
    // Convert dash p tags to rules
    if (p.textContent.trim() === '---') {
      const hr = document.createElement('hr');
      p.parentElement.replaceChild(hr, p);
    }
  });
}

function convertListItems(editor) {
  const topLevelLists = editor.querySelectorAll('ul > li, ol > li');

  topLevelLists.forEach((li) => {
    if (li.firstChild?.classList?.contains('loc-deleted-view')) {
      li.remove(); // remove deleted nodes in preview
    } else if (li.firstChild?.classList?.contains('loc-added-view')) {
      li.querySelector('.loc-color-overlay')?.remove();
      li.innerHTML = li.firstChild.innerHTML;
    }
  });

  const lis = editor.querySelectorAll('li');
  lis.forEach((li) => {
    // Collapse single child p tags
    if (li.children.length === 1 && li.firstElementChild.nodeName === 'P') {
      li.innerHTML = li.firstElementChild.innerHTML;
    }
  });
}

function makeSections(editor) {
  const children = editor.querySelectorAll(':scope > *');

  const section = document.createElement('div');
  const sections = [...children].reduce((acc, child) => {
    if (child.nodeName === 'HR') {
      child.remove();
      acc.push(document.createElement('div'));
    } else {
      acc[acc.length - 1].append(child);
    }
    return acc;
  }, [section]);

  editor.append(...sections);
}

function removeMetadata(editor) {
  editor.querySelector('.metadata')?.remove();
}

const iconRegex = /(?<!(?:https?|urn)[^\s<>]*):(#?[a-z_-]+[a-z\d]*):/gi;
function parseIcons(editor) {
  if (!iconRegex.test(editor.innerHTML)) return;
  editor.innerHTML = editor.innerHTML.replace(
    iconRegex,
    (_, iconName) => `<span class="icon icon-${iconName}"></span>`,
  );
}

const removeEls = (els) => els.forEach((el) => el.remove());

function prose2aem(editor, livePreview, isFragment = false) {
  if (!isFragment) editor.removeAttribute('class');

  editor.removeAttribute('contenteditable');
  editor.removeAttribute('translate');

  const daDiffDeletedEls = editor.querySelectorAll('da-diff-deleted');
  removeEls(daDiffDeletedEls);

  const emptyImgs = editor.querySelectorAll('img.ProseMirror-separator');
  removeEls(emptyImgs);

  const trailingBreaks = editor.querySelectorAll('.ProseMirror-trailingBreak');
  removeEls(trailingBreaks);

  const userPointers = editor.querySelectorAll('.ProseMirror-yjs-cursor');
  removeEls(userPointers);

  const gapCursors = editor.querySelectorAll('.ProseMirror-gapcursor');
  removeEls(gapCursors);

  const highlights = editor.querySelectorAll('span.ProseMirror-yjs-selection');
  highlights.forEach((el) => {
    el.parentElement.replaceChild(document.createTextNode(el.innerText), el);
  });

  convertListItems(editor);

  convertParagraphs(editor);

  convertBlocks(editor, isFragment);

  if (livePreview) {
    removeMetadata(editor);
    parseIcons(editor);
  }

  makePictures(editor);

  if (!isFragment) {
    makeSections(editor);
  }

  if (isFragment) {
    return editor.innerHTML;
  }

  const html = `
    <body>
      <header></header>
      <main>${editor.innerHTML}</main>
      <footer></footer>
    </body>
  `;

  return html;
}

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

  // Check if tables already have tableWrapper (from ProseMirror tableEditing plugin)
  const existingWrappedTables = editorClone.querySelectorAll('.tableWrapper > table');
  const unwrappedTables = Array.from(editorClone.querySelectorAll('table')).filter(table => 
    !table.parentElement.classList.contains('tableWrapper')
  );
  
  // Only wrap tables that don't already have tableWrapper
  const originalTables = Array.from(view.dom.querySelectorAll('table')).filter(table => 
    !table.parentElement.classList.contains('tableWrapper')
  );
  
  unwrappedTables.forEach((table, index) => {
    const div = document.createElement('div');
    div.className = 'tableWrapper';
    table.insertAdjacentElement('afterend', div);
    div.append(table);
    const blockMarker = document.createElement('div');
    blockMarker.className = 'block-marker';
    const position = view.posAtDOM(originalTables[index], 0);
    blockMarker.setAttribute('data-prose-index', position);
    div.insertAdjacentElement('beforebegin', blockMarker);
  });
  
  // For already wrapped tables, just add block markers
  existingWrappedTables.forEach((table, index) => {
    const wrapper = table.parentElement;
    const blockMarker = document.createElement('div');
    blockMarker.className = 'block-marker';
    // Find corresponding original table
    const allOriginalTables = view.dom.querySelectorAll('table');
    const originalWrappedTables = Array.from(allOriginalTables).filter(t => 
      t.parentElement.classList.contains('tableWrapper')
    );
    if (originalWrappedTables[index]) {
      const position = view.posAtDOM(originalWrappedTables[index], 0);
      blockMarker.setAttribute('data-prose-index', position);
      wrapper.insertAdjacentElement('beforebegin', blockMarker);
    }
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
  // DON'T extract from <main> - the parent page's setBody() expects the full document structure
  // It will parse it with DOMParser and extract body.innerHTML itself
  
  let htmlString = prose2aem(editorClone, true);
  
  // Replace block-marker divs with data-block-index on the following div
  htmlString = htmlString.replace(
    /<div class="block-marker" data-prose-index="(\d+)"><\/div>\s*<div([^>]*?)>/gi,
    (match, proseIndex, divAttributes) => `<div${divAttributes} data-block-index="${proseIndex}">`
  );

  return htmlString;
}