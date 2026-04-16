export function listKeydown(e, {
  items, active, key, shadowRoot, setActive, onSelect,
}) {
  const selectable = items?.filter((i) => !i.divider && !i.section) ?? [];
  if (!selectable.length) return;

  const curIdx = selectable.findIndex((i) => i[key] === active);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = selectable[(curIdx + 1) % selectable.length][key];
    setActive(next);
    shadowRoot.querySelector(`[data-${key}="${next}"]`)?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = selectable[(curIdx <= 0 ? selectable.length : curIdx) - 1][key];
    setActive(prev);
    shadowRoot.querySelector(`[data-${key}="${prev}"]`)?.focus();
  } else if (e.key === 'Enter' && active !== undefined) {
    e.preventDefault();
    onSelect(selectable.find((i) => i[key] === active));
  }
}
