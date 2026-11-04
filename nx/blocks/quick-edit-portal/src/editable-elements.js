export const EDITABLES = [
  { selector: 'h1', nodeName: 'H1', nodeType: 'heading' },
  { selector: 'h2', nodeName: 'H2', nodeType: 'heading' },
  { selector: 'h3', nodeName: 'H3', nodeType: 'heading' },
  { selector: 'h4', nodeName: 'H4', nodeType: 'heading' },
  { selector: 'h5', nodeName: 'H5', nodeType: 'heading' },
  { selector: 'h6', nodeName: 'H6', nodeType: 'heading' },
  { selector: 'p', nodeName: 'P', nodeType: 'paragraph' },
  { selector: 'ol', nodeName: 'OL', nodeType: 'ordered_list' },
  { selector: 'ul', nodeName: 'UL', nodeType: 'bullet_list' },
  { selector: 'pre', nodeName: 'PRE', nodeType: 'code_block' },
  { selector: 'blockquote', nodeName: 'BLOCKQUOTE', nodeType: 'blockquote' },
];

export const EDITABLE_SELECTORS = EDITABLES.map((edit) => edit.selector).join(', ');
export const EDITABLE_NODE_TYPES = new Set(EDITABLES.map((edit) => edit.nodeType));
