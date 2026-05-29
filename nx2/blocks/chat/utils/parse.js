export function parseDirectives(text) {
  const segments = [];
  const buf = [];
  let type = null;
  let openLine = null;

  for (const line of text.split('\n')) {
    if (!type && line.startsWith(':::')) {
      const extracted = line.slice(3).split(' ')[0];
      if (!extracted) {
        buf.push(line);
      } else {
        const content = buf.splice(0).join('\n');
        if (content) segments.push({ kind: 'text', content });
        type = extracted;
        openLine = line;
      }
    } else if (type && line.trimEnd() === ':::') {
      segments.push({ kind: 'directive', type, content: buf.splice(0).join('\n') });
      type = null;
      openLine = null;
    } else {
      buf.push(line);
    }
  }

  if (openLine) {
    segments.push({ kind: 'directive', type, content: buf.join('\n') });
  } else {
    const tail = buf.join('\n');
    if (tail) segments.push({ kind: 'text', content: tail });
  }
  return segments;
}
