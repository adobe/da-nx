export function getOverlayById({ id, className = id, root = document }) {
  let overlay = root.getElementById(id);
  if (!overlay) {
    overlay = root.createElement('div');
    overlay.id = id;
    overlay.className = className;
    overlay.setAttribute('aria-hidden', 'true');
    root.body.append(overlay);
  }
  return overlay;
}

export function clearOverlayById(id, root = document) {
  root.getElementById(id)?.replaceChildren();
}

// Falls back to the nearest ancestor with a size when the element itself has no layout box.
export function visibleRect(element) {
  let rect = element.getBoundingClientRect();
  let parent = element.parentElement;
  while (parent && !rect.width && !rect.height) {
    rect = parent.getBoundingClientRect();
    parent = parent.parentElement;
  }
  return rect;
}

// Calls `onChange` (rAF-throttled) when the page scrolls, resizes or finishes animating.
// Returns the throttled trigger and the ResizeObserver (when supported).
export function watchLayout(onChange, root = document) {
  let scheduled = false;
  const handler = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      onChange();
    });
  };
  window.addEventListener('scroll', handler, true);
  window.addEventListener('resize', handler);
  root.addEventListener('transitionend', handler);
  root.addEventListener('animationend', handler);
  let resizeObserver;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handler);
    resizeObserver.observe(root.documentElement);
    const main = root.querySelector('main');
    if (main) resizeObserver.observe(main);
  }
  return { schedule: handler, resizeObserver };
}

export function runAfterLoad(run) {
  if (document.readyState !== 'complete') {
    window.addEventListener('load', run, { once: true });
  }
}
