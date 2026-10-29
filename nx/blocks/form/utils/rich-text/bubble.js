// Rects are viewport based. The result is relative to `area`, the bubble's offset parent.
export function placeBubble({
  start, end, area, width, height, edge = 8, gap = 10,
}) {
  const lineEnd = Math.abs(end.top - start.top) < 1 ? end.left : area.right;
  const center = (start.left + lineEnd) / 2 - area.left;
  const left = Math.max(edge, Math.min(center - width / 2, area.width - width - edge));
  const above = start.top - height - gap;
  const top = (above < area.top ? end.bottom + gap : above) - area.top;
  const hidden = start.top < area.top || start.top > area.bottom;
  return { left, top, hidden };
}
