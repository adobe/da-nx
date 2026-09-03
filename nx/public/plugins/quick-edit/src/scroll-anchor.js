// Keep scroll position across a full-body reload (SET_BODY resets it to the top):
// anchor to the top-most visible block before the swap, re-align to it after.

function indexedBlocks() {
  const scope = document.querySelector('main') || document;
  return [...scope.querySelectorAll('[data-block-index]')];
}

export function captureScrollAnchor() {
  const block = indexedBlocks().find((el) => el.getBoundingClientRect().bottom > 0);
  if (block) {
    return { index: block.getAttribute('data-block-index'), top: block.getBoundingClientRect().top };
  }
  return { scrollY: window.scrollY };
}

// Re-aligns to the anchor as the page reflows (images, decoration), stopping after a
// short window or as soon as the user scrolls.
export function restoreScrollAnchor(anchor) {
  if (!anchor || (anchor.index == null && anchor.scrollY == null)) return;

  const resolve = () => (anchor.index == null ? null
    : indexedBlocks().find((el) => el.getAttribute('data-block-index') === anchor.index));

  const apply = () => {
    const el = resolve();
    if (el) window.scrollBy(0, Math.round(el.getBoundingClientRect().top - anchor.top));
    else if (anchor.scrollY != null) window.scrollTo(0, anchor.scrollY);
  };

  let stopped = false;
  let timer;
  const observer = new ResizeObserver(() => apply());
  const stop = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    clearTimeout(timer);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchmove', stop);
    window.removeEventListener('keydown', stop);
  };
  timer = setTimeout(stop, 600);
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchmove', stop, { passive: true });
  window.addEventListener('keydown', stop);

  // Wait for the new DOM to lay out, align, then keep pinned as it reflows.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (stopped) return;
    apply();
    observer.observe(document.querySelector('main') || document.body);
  }));
}
