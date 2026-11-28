import * as Y from 'yjs';
import { aem2doc, doc2aem } from '@adobe/da-parser';

export * from '@adobe/da-merge';
export { default } from '@adobe/da-merge';

export function canonicalize(html) {
  const ydoc = new Y.Doc();
  aem2doc(html, ydoc);
  return doc2aem(ydoc);
}
