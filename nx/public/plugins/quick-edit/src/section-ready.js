const STATUS_ATTR = 'data-section-status';
const LOADED = 'loaded';

function topLevelSections(root) {
  return [...root.querySelectorAll(`[${STATUS_ATTR}]`)]
    .filter((section) => !section.parentElement?.closest(`[${STATUS_ATTR}]`));
}

/**
 * Calls `onReady(section)` once for every top-level section of `root` as soon as the
 * site reports it as `data-section-status="loaded"`.
 *
 * Block code rewrites a section's DOM until the section is loaded (e.g. by moving
 * authored links into a new list). Editors attached before that point would have
 * their content moved out from under them, and ProseMirror would turn those DOM
 * mutations into edits that get written back to the document. `ctx.loadPage()`
 * resolving is not enough: when two loadPage runs overlap (the site's own initial
 * load and quick-edit's), the second one skips sections the first is still loading.
 *
 * Sites that don't track section status get `onReady(root)` immediately.
 *
 * @param {Element} root The container holding the sections (usually `main`)
 * @param {(section: Element) => void} onReady
 * @returns {() => void} Cancels any pending waits
 */
export function whenSectionsLoaded(root, onReady) {
  const sections = topLevelSections(root);
  if (!sections.length) {
    onReady(root);
    return () => {};
  }

  const pending = new Set();
  sections.forEach((section) => {
    if (section.getAttribute(STATUS_ATTR) === LOADED) onReady(section);
    else pending.add(section);
  });
  if (!pending.size) return () => {};

  const observer = new MutationObserver(() => {
    pending.forEach((section) => {
      if (!section.isConnected) {
        pending.delete(section);
      } else if (section.getAttribute(STATUS_ATTR) === LOADED) {
        pending.delete(section);
        onReady(section);
      }
    });
    if (!pending.size) observer.disconnect();
  });
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: [STATUS_ATTR] });

  return () => {
    observer.disconnect();
    pending.clear();
  };
}
