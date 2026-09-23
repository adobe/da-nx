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
 *       loadQuickEdit({ ...payload, reloadScope: 'main' }, (body) => {
 *         const main = body.querySelector('main');
 *         decorateMain(main);
 *         loadSections(main);
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
export function replaceChanges({ ctx, doc, targetDocument }) {
  if (ctx.reloadScope) {
    const reloadScope = targetDocument.body.querySelector(ctx.reloadScope)
      || targetDocument.body.querySelector('main');
    const replacement = doc.body.querySelector(ctx.reloadScope)
      || doc.body.querySelector('main');
    if (reloadScope && replacement) {
      reloadScope.innerHTML = replacement.innerHTML;
      return;
    }
  }

  targetDocument.body.innerHTML = doc.body.innerHTML;
}
