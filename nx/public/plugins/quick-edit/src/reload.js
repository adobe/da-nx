/**
 * rerenderScope is expected to have the following structure
 // { "type": "page" }
  // { "type": "section", "sectionIndex": 2 }
  // { "type": "section-added", "sectionIndex": 2 } (index in the new body)
  // { "type": "section-removed", "sectionIndex": 2 } (index in the previous body)
  // { "type": "block", "sectionIndex": 0, "blockIndex": 1 }
 * blockIndex is page-wide (not per section), matching da-live's parseSections.
 */
const getSourceSections = (root) => [...root.querySelectorAll(':scope > div')];

const getSourceBlocks = (sections) => sections
  .flatMap((section) => [...section.querySelectorAll(':scope > div[data-block-index]')]);

const getLiveSections = (root) => [...root.querySelectorAll('div.section')]
  .filter((section) => !section.parentElement.closest('.block'));

const getLiveBlocks = (sections) => sections
  .flatMap((section) => [...section.querySelectorAll(':scope > div > .block')]);

function replaceSection({ source, live, type, sectionIndex }) {
  const sourceSections = getSourceSections(source);
  const liveSections = getLiveSections(live);
  const diff = sourceSections.length - liveSections.length;
  const next = sourceSections[sectionIndex]?.cloneNode(true);
  const prev = liveSections[sectionIndex];

  if (type === 'section-removed') {
    if (diff !== -1 || !prev) return undefined;
    prev.remove();
    return { type: 'section-removed' };
  }
  if (type === 'section-added') {
    if (diff !== 1 || !next) return undefined;
    if (prev) prev.before(next);
    else if (liveSections[sectionIndex - 1]) liveSections[sectionIndex - 1].after(next);
    else return undefined;
    return { type: 'section', el: next };
  }
  if (diff !== 0 || !next || !prev) return undefined;
  prev.replaceWith(next);
  return { type: 'section', el: next };
}

function replaceBlock({ source, live, blockIndex }) {
  const sourceBlocks = getSourceBlocks(getSourceSections(source));
  const liveBlocks = getLiveBlocks(getLiveSections(live));
  const next = sourceBlocks[blockIndex]?.cloneNode(true);
  const prev = liveBlocks[blockIndex];
  if (!next || !prev || sourceBlocks.length !== liveBlocks.length) return undefined;
  prev.replaceWith(next);
  return { type: 'block', el: next };
}

/**
 * Example usage for the optimized reload flow:
 *
 * ```js
 * ;(() => {
 *   const params = new URLSearchParams(window.location.search);
 *   if (!params.has('quick-edit')) return;
 *
 *   document.body.classList.add('quick-edit');
 *
 *   const payload = (() => {
 *     try {
 *       const q = params.get('quick-edit');
 *       return q && q !== 'on' ? JSON.parse(decodeURIComponent(q)) : {};
 *     } catch {
 *       return {};
 *     }
 *   })();
 *
 *   import('https://da.live/nx/public/plugins/quick-edit/quick-edit.js')
 *     .then(({ default: loadQuickEdit }) =>
 *       loadQuickEdit({ ...payload, reloadScope: 'main' }, (replaced) => {
 *         // `replaced` is undefined when the whole scope was re-rendered.
 *         if (!replaced) {
 *           const main = document.body.querySelector('main');
 *           decorateMain(main);
 *           return loadSections(main);
 *         }
 *         // Otherwise only `replaced.el` is undecorated — decorating the whole
 *         // main again would re-wrap the sections that are already decorated.
 *         return decorateReplaced(replaced);
 *       }),
 *     )
 *     .catch((e) => {
 *       console.error('[quick-edit] failed to load plugin', e);
 *     });
 * })();
 * ```
 *
 * The full-body reload flow is still supported:
 *
 * ```js
 * import('https://da.live/nx/public/plugins/quick-edit/quick-edit.js')
 *   .then(({ default: loadQuickEdit }) => loadQuickEdit(payload, loadPage));
 * ```
 *
 * The optimized reload also supports an empty main element on initial load:
 *
 * ```html
 * <body>
 *   <header></header>
 *   <main><div></div></main>
 *   <footer></footer>
 * </body>
 * ```
 */
export function replaceChanges({ ctx, doc, rerenderScope = { type: 'page' }, targetDocument }) {
  if (ctx.reloadScope) {
    const source = doc.body.querySelector(ctx.reloadScope)
      || doc.body.querySelector('main');
    const live = targetDocument.body.querySelector(ctx.reloadScope)
      || targetDocument.body.querySelector('main');
    if (source && live) {
      const { type, sectionIndex, blockIndex } = rerenderScope;
      if (type === 'block') {
        const replaced = replaceBlock({ source, live, blockIndex });
        if (replaced) return replaced;
      }
      if (type !== 'page') {
        const replaced = replaceSection({ source, live, type, sectionIndex });
        if (replaced) return replaced;
      }
      live.innerHTML = source.innerHTML;
      return undefined;
    }
  }

  targetDocument.body.innerHTML = doc.body.innerHTML;
  return undefined;
}
