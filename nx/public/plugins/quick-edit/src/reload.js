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
