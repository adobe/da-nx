// Positions a popover directly above a reference element (e.g. the chat form),
// sized to match its width and capped to fit without overflowing above it.
export function openPopoverAbove(popover, anchor, { gap = 8, maxHeight = 400, onOpen } = {}) {
  if (!popover || !anchor) return;
  const { left, width, top } = anchor.getBoundingClientRect();
  popover.style.left = `${left}px`;
  popover.style.width = `${width}px`;
  popover.style.bottom = `${window.innerHeight - top + gap}px`;
  popover.style.height = `${Math.min(top - gap, maxHeight)}px`;
  if (onOpen) {
    popover.addEventListener('toggle', ({ newState }) => {
      if (newState === 'open') onOpen();
    }, { once: true });
  }
  popover.show();
}
