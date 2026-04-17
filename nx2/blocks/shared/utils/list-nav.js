export function listKeydown(key, {
  items, active, itemKey, shadowRoot, setActive, onSelect, onClose,
  focusActiveItem = true,
}) {
  const selectable = items?.filter((i) => !i.divider && !i.section) ?? [];
  if (!selectable.length) return false;

  const curIdx = selectable.findIndex((i) => i[itemKey] === active);

  if (key === 'ArrowDown') {
    const next = selectable[(curIdx + 1) % selectable.length][itemKey];
    setActive(next);
    if (focusActiveItem) shadowRoot.querySelector(`[data-${itemKey}="${next}"]`)?.focus();
    return true;
  } else if (key === 'ArrowUp') {
    const prev = selectable[(curIdx <= 0 ? selectable.length : curIdx) - 1][itemKey];
    setActive(prev);
    if (focusActiveItem) shadowRoot.querySelector(`[data-${itemKey}="${prev}"]`)?.focus();
    return true;
  } else if (key === 'Enter' && active !== undefined) {
    onSelect(selectable.find((i) => i[itemKey] === active));
    return true;
  } else if (key === 'Escape') {
    onClose();
    return true;
  }
  return false;
}
