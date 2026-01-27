import('./quick-edit-library.js');
import('./quick-edit-outline.js');
import('./sidebar.js');

function createDropTargets() {
  const dropTargets = [];

  // Create drop targets for regular editable elements (not inside blocks)
  const editableElements = document.querySelectorAll('[data-prose-index]');
  editableElements.forEach((el) => {
    // Skip elements that are inside a block (have a parent with data-block-index)
    if (el.closest('[data-block-index]')) {
      return;
    }

    // Create drop target before element
    const beforeTarget = document.createElement('div');
    beforeTarget.className = 'qe-drop-target';
    beforeTarget.dataset.position = 'before';
    beforeTarget.dataset.proseIndex = el.dataset.proseIndex;
    beforeTarget.textContent = 'Insert block';
    el.parentNode.insertBefore(beforeTarget, el);
    dropTargets.push(beforeTarget);

    // Create drop target after element
    const afterTarget = document.createElement('div');
    afterTarget.className = 'qe-drop-target';
    afterTarget.dataset.position = 'after';
    afterTarget.dataset.proseIndex = el.dataset.proseIndex;
    afterTarget.textContent = 'Insert block';
    el.parentNode.insertBefore(afterTarget, el.nextSibling);
    dropTargets.push(afterTarget);
  });

  // Create drop targets for block elements (only before, since we don't know the end position)
  const blockElements = document.querySelectorAll('[data-block-index]');
  blockElements.forEach((el) => {
    // Create drop target before block
    const beforeTarget = document.createElement('div');
    beforeTarget.className = 'qe-drop-target';
    beforeTarget.dataset.position = 'before';
    beforeTarget.dataset.proseIndex = el.dataset.blockIndex;
    beforeTarget.textContent = 'Insert block';
    el.parentNode.insertBefore(beforeTarget, el);
    dropTargets.push(beforeTarget);
  });

  return dropTargets;
}

function removeDropTargets(dropTargets) {
  dropTargets.forEach(target => target.remove());
}

function setupDropTargetHandlers(dropTargets, blockHtml, ctx) {
  dropTargets.forEach(target => {
    target.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      target.classList.add('qe-drop-target-active');
    });

    target.addEventListener('dragleave', (e) => {
      target.classList.remove('qe-drop-target-active');
    });

    target.addEventListener('drop', (e) => {
      e.preventDefault();
      const proseIndex = parseInt(target.dataset.proseIndex, 10);
      const position = target.dataset.position;
      
      ctx.port.postMessage({
        type: 'insert-block-at',
        html: blockHtml,
        proseIndex,
        position,
      });

      target.classList.remove('qe-drop-target-active');
    });
  });
}

export default function setupAdvancedMode(ctx) {
  let dropTargets = [];
  let currentBlockHtml = '';

  // Create sidebar
  const sidebar = document.createElement('quick-edit-sidebar');
  
  // Set properties on sidebar
  sidebar.config = ctx.config;
  sidebar.messagePort = ctx.port;
  
  // Handle block drag start
  sidebar.addEventListener('block-drag-start', (e) => {
    currentBlockHtml = e.detail.html;
    dropTargets = createDropTargets();
    setupDropTargetHandlers(dropTargets, currentBlockHtml, ctx);
  });

  // Handle block drag end
  sidebar.addEventListener('block-drag-end', () => {
    removeDropTargets(dropTargets);
    dropTargets = [];
    currentBlockHtml = '';
  });

  // Handle block insertion
  sidebar.addEventListener('insert-block', (e) => {
    const { html } = e.detail;
    ctx.port.postMessage({ type: 'insert-block', html });
  });
  
  document.body.appendChild(sidebar);
}
