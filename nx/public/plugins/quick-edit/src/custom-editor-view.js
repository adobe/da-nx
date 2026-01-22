import { TextSelection } from 'https://da.live/deps/da-y-wrapper/dist/index.js';

/**
 * A lightweight custom EditorView that renders ProseMirror content directly
 * into an element without wrapper divs.
 * 
 * Supports:
 * - Marks: link, strong (bold), em (italic), u (underline)
 * - Nodes: paragraph, heading (h1-h6), bullet_list, ordered_list, list_item
 */
export class CustomEditorView {
  constructor(element, { state, handleDOMEvents, dispatchTransaction }) {
    this.element = element;
    this.state = state;
    this.handleDOMEvents = handleDOMEvents || {};
    this.dispatchTransaction = dispatchTransaction;
    this.editable = true;
    
    // Make element contenteditable
    this.element.setAttribute('contenteditable', 'true');
    
    // Initial render
    this.updateDOM();
    
    // Set up event listeners
    this.setupEventListeners();
  }

  serializeFragment(fragment) {
    const container = document.createDocumentFragment();
    fragment.forEach((node) => {
      container.appendChild(this.serializeNode(node));
    });
    return container;
  }

  serializeNode(node) {
    if (node.isText) {
      return this.serializeText(node);
    }
    
    const dom = this.createNodeDOM(node);
    this.serializeContent(node, dom);
    return dom;
  }

  createNodeDOM(node) {
    const type = node.type.name;
    
    switch (type) {
      case 'paragraph':
        return document.createElement('p');
      case 'heading':
        return document.createElement(`h${node.attrs.level || 1}`);
      case 'bullet_list':
        return document.createElement('ul');
      case 'ordered_list':
        return document.createElement('ol');
      case 'list_item':
        return document.createElement('li');
      default:
        return document.createElement('div');
    }
  }

  serializeContent(node, dom) {
    node.forEach((child) => {
      dom.appendChild(this.serializeNode(child));
    });
  }

  serializeText(node) {
    let dom = document.createTextNode(node.text);
    
    // Sort marks so links are always innermost
    // Order: link first, then u, em, strong (outermost)
    const marks = node.marks.slice().sort((a, b) => {
      const order = { link: 1, u: 2, em: 3, strong: 4 };
      const aOrder = order[a.type.name] || 0;
      const bOrder = order[b.type.name] || 0;
      return aOrder - bOrder;
    });
    
    // Wrap with marks (link innermost, strong outermost)
    for (const mark of marks) {
      const markDOM = this.createMarkDOM(mark);
      markDOM.appendChild(dom);
      dom = markDOM;
    }
    
    return dom;
  }

  createMarkDOM(mark) {
    const type = mark.type.name;
    
    switch (type) {
      case 'strong':
        return document.createElement('strong');
      case 'em':
        return document.createElement('em');
      case 'u':
        return document.createElement('u');
      case 'link': {
        const a = document.createElement('a');
        a.href = mark.attrs.href;
        if (mark.attrs.title) {
          a.title = mark.attrs.title;
        }
        if (mark.attrs.target) {
          a.target = mark.attrs.target;
        }
        return a;
      }
      default:
        return document.createElement('span');
    }
  }

  updateDOM() {
    // Save cursor position
    const selection = window.getSelection();
    let cursorOffset = 0;
    if (selection.rangeCount > 0 && this.element.contains(selection.anchorNode)) {
      cursorOffset = this.getTextOffset(selection.anchorNode, selection.anchorOffset);
    }
    
    // Clear current content
    this.element.innerHTML = '';
    
    // Render new content directly into element
    // For our use case, the doc contains a single paragraph with the content
    const firstChild = this.state.doc.firstChild;
    if (firstChild) {
      this.serializeContent(firstChild, this.element);
    }
    
    // Restore cursor position
    if (cursorOffset > 0) {
      this.setTextOffset(cursorOffset);
    }
  }
  
  getTextOffset(node, offset) {
    // Calculate text offset from the start of the element
    const walker = document.createTreeWalker(
      this.element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let currentOffset = 0;
    let textNode;
    
    while (textNode = walker.nextNode()) {
      if (textNode === node) {
        return currentOffset + offset;
      }
      currentOffset += textNode.textContent.length;
    }
    
    return currentOffset;
  }
  
  setTextOffset(targetOffset) {
    const walker = document.createTreeWalker(
      this.element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let currentOffset = 0;
    let textNode;
    
    while (textNode = walker.nextNode()) {
      const nodeLength = textNode.textContent.length;
      if (currentOffset + nodeLength >= targetOffset) {
        const range = document.createRange();
        const offset = targetOffset - currentOffset;
        range.setStart(textNode, Math.min(offset, nodeLength));
        range.collapse(true);
        
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      currentOffset += nodeLength;
    }
  }

  updateState(state) {
    this.state = state;
    this.updateDOM();
  }

  setupEventListeners() {
    // Input event - handles typing
    this.element.addEventListener('input', (e) => {
      this.handleInput(e);
    });
    
    // Keydown for special keys
    this.element.addEventListener('keydown', (e) => {
      if (this.handleDOMEvents.keydown) {
        const handled = this.handleDOMEvents.keydown(this, e);
        if (handled) return;
      }
    });
    
    // Selection change
    this.element.addEventListener('focus', (e) => {
      if (this.handleDOMEvents.focus) {
        this.handleDOMEvents.focus(this, e);
      }
    });
    
    this.element.addEventListener('blur', (e) => {
      if (this.handleDOMEvents.blur) {
        this.handleDOMEvents.blur(this, e);
      }
    });
    
    // Track selection changes
    document.addEventListener('selectionchange', () => {
      this.handleSelectionChange();
    });
  }

  handleInput(e) {
    try {
      // Parse current DOM content back into ProseMirror nodes
      const content = this.parseContent(this.element);
      
      if (content.length === 0) return;
      
      // Wrap in paragraph for the internal doc structure
      const paragraph = this.state.schema.nodes.paragraph.create(null, content);
      
      // Create a transaction to replace the document content
      const tr = this.state.tr.replaceWith(
        0, 
        this.state.doc.content.size, 
        paragraph
      );
      
      if (this.dispatchTransaction) {
        this.dispatchTransaction(tr);
      }
    } catch (e) {
      console.error('Failed to handle input:', e);
    }
  }

  parseContent(dom) {
    const { schema } = this.state;
    const content = [];
    
    for (const child of dom.childNodes) {
      const nodes = this.parseNode(child, schema, []);
      if (nodes) {
        if (Array.isArray(nodes)) {
          content.push(...nodes);
        } else {
          content.push(nodes);
        }
      }
    }
    
    return content;
  }

  parseNode(dom, schema, marks) {
    // Text node
    if (dom.nodeType === Node.TEXT_NODE) {
      const text = dom.textContent;
      if (text) {
        let textNode = schema.text(text);
        // Apply accumulated marks
        if (marks.length > 0) {
          textNode = textNode.mark(marks);
        }
        return textNode;
      }
      return null;
    }
    
    // Element node
    if (dom.nodeType === Node.ELEMENT_NODE) {
      return this.parseElement(dom, schema, marks);
    }
    
    return null;
  }

  parseElement(element, schema, parentMarks) {
    const tagName = element.tagName.toLowerCase();
    
    // Check if this element represents a mark
    const newMark = this.parseMarkFromElement(element, schema);
    const marks = newMark ? [...parentMarks, newMark] : parentMarks;
    
    // If it's a mark element, parse children with the accumulated marks
    if (newMark) {
      const content = [];
      for (const child of element.childNodes) {
        const nodes = this.parseNode(child, schema, marks);
        if (nodes) {
          if (Array.isArray(nodes)) {
            content.push(...nodes);
          } else {
            content.push(nodes);
          }
        }
      }
      return content;
    }
    
    // Otherwise, parse children with current marks
    const content = [];
    for (const child of element.childNodes) {
      const nodes = this.parseNode(child, schema, marks);
      if (nodes) {
        if (Array.isArray(nodes)) {
          content.push(...nodes);
        } else {
          content.push(nodes);
        }
      }
    }
    
    return content;
  }

  parseMarkFromElement(element, schema) {
    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      case 'strong':
      case 'b':
        return schema.marks.strong.create();
      case 'em':
      case 'i':
        return schema.marks.em.create();
      case 'u':
        return schema.marks.u.create();
      case 'a':
        return schema.marks.link.create({
          href: element.getAttribute('href') || '',
          title: element.getAttribute('title') || null,
          target: element.getAttribute('target') || null
        });
      default:
        return null;
    }
  }

  getSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    
    try {
      const range = sel.getRangeAt(0);
      // Convert DOM selection to ProseMirror position
      // This is simplified - just put cursor at the end
      const pos = this.state.doc.content.size;
      return TextSelection.create(this.state.doc, pos);
    } catch (e) {
      return null;
    }
  }

  handleSelectionChange() {
    // Handle selection changes if needed
  }

  focus() {
    this.element.focus();
  }

  destroy() {
    this.element.removeAttribute('contenteditable');
    // Clean up event listeners if needed
  }

  get dom() {
    return this.element;
  }

  hasFocus() {
    return document.activeElement === this.element;
  }
}
