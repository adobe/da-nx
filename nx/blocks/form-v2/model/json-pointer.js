function escapeSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapeSegment(segment) {
  return String(segment).replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (!pointer || typeof pointer !== 'string') return [];
  const trimmed = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  if (!trimmed) return [];
  return trimmed.split('/').map(unescapeSegment);
}

export function appendPointer({ pointer, segment }) {
  const base = pointer === '' || pointer === '/' ? '' : pointer.replace(/\/$/, '');
  const escaped = escapeSegment(segment);
  return base ? `${base}/${escaped}` : `/${escaped}`;
}

export function getParentPointer(pointer) {
  const segments = parsePointer(pointer);
  if (segments.length <= 1) return '';
  return `/${segments.slice(0, -1).map(escapeSegment).join('/')}`;
}

export function getPointerValue({ data, pointer }) {
  const segments = parsePointer(pointer);
  let current = data;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}
