/**
 * Apply EDS HTML to a collaborative Y.Doc (same semantics as da-agent CollabClient.applyContent).
 */
// eslint-disable-next-line import/no-unresolved
import { Y } from 'da-y-wrapper';
// eslint-disable-next-line import/no-unresolved
import { aem2doc, doc2aem } from 'da-parser';

/**
 * @param {import('yjs').Doc} ydoc
 * @param {string} html
 */
export function applyAemHtmlToYdoc(ydoc, html) {
  if (!ydoc || typeof html !== 'string') return;
  ydoc.transact(() => {
    const rootType = ydoc.getXmlFragment('prosemirror');
    rootType.delete(0, rootType.length);
    ydoc.share.forEach((type) => {
      if (type instanceof Y.Map) {
        type.clear();
      }
    });
    aem2doc(html, ydoc);
  });
}

/**
 * @param {import('yjs').Doc} ydoc
 * @returns {string | null}
 */
export function snapshotAemHtmlFromYdoc(ydoc) {
  if (!ydoc) return null;
  try {
    return doc2aem(ydoc);
  } catch {
    return null;
  }
}
