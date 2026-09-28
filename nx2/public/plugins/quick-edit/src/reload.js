// With `reloadScope` (e.g. 'main') header and footer are never replaced; without it the body is.
const query = (root, selector) => {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
};

function getLiveRoot(targetDocument, selector) {
  const { body } = targetDocument;
  const existing = query(body, selector) ?? body.querySelector('main');
  if (existing) return existing;
  const main = targetDocument.createElement('main');
  const header = body.querySelector(':scope > header');
  if (header) header.after(main);
  else body.prepend(main);
  return main;
}

export function replaceChanges({ ctx, doc, targetDocument }) {
  if (!ctx.reloadScope) {
    targetDocument.body.innerHTML = doc.body.innerHTML;
    return;
  }
  const source = query(doc.body, ctx.reloadScope) ?? doc.body.querySelector('main');
  getLiveRoot(targetDocument, ctx.reloadScope).innerHTML = source?.innerHTML ?? '';
}
