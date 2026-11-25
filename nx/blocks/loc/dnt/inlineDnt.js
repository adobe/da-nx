export function parseInlineRule({ pattern, action }) {
  if (action !== 'dnt-inline') return null;

  const expression = typeof pattern === 'string' && pattern.trim().match(/^between\((.*)\)$/);
  const delimiters = expression ? expression[1].split(',').map((part) => part.trim()) : [];
  const [open, close] = delimiters;
  if (delimiters.length !== 2 || !open || !close
    || (open !== close && (open.startsWith(close) || close.startsWith(open)))) {
    throw new Error(`Invalid dnt-inline rule "${pattern}": use between(open, close) with two nonempty, non-overlapping delimiters.`);
  }
  return { action, condition: 'between', open, close };
}

function findRanges(text, { open, close }) {
  const ranges = [];
  const starts = [];
  let cursor = 0;

  while (cursor < text.length) {
    if (text[cursor] === '\n' || text[cursor] === '\r') {
      starts.length = 0;
      cursor += 1;
    } else if (starts.length && text.startsWith(close, cursor)) {
      const start = starts.pop();
      cursor += close.length;
      ranges.push({ start, end: cursor });
    } else if (text.startsWith(open, cursor)) {
      starts.push(cursor);
      cursor += open.length;
    } else {
      cursor += 1;
    }
  }
  return ranges;
}

export function addInlineDnt({ root, rules }) {
  if (!rules.length) return;

  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement.closest('[translate="no"], [data-inner-html], .dnt-text, script, style, code')) {
      nodes.push(node);
    }
  }

  nodes.forEach((node) => {
    const text = node.textContent;
    // Collect matches before wrapping, preferring the longest at the same start.
    const ranges = rules.flatMap((rule) => findRanges(text, rule))
      .sort((a, b) => a.start - b.start || b.end - a.end);
    if (!ranges.length) return;

    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    ranges.forEach(({ start, end }) => {
      if (start < cursor) return;
      fragment.append(doc.createTextNode(text.slice(cursor, start)));
      const span = doc.createElement('span');
      span.className = 'dnt-text';
      span.setAttribute('translate', 'no');
      span.textContent = text.slice(start, end);
      fragment.append(span);
      cursor = end;
    });
    fragment.append(doc.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  });
}
