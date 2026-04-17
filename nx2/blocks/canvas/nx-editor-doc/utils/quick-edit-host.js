import { createControllerOnMessage } from '../../nx-editor-wysiwyg/quick-edit-controller.js';
import { updateDocument, updateCursors } from '../../editor-utils/document.js';
import { fetchWysiwygCookie } from '../../editor-utils/preview.js';

export function prefetchWysiwygCookiesIfSignedIn(ctx) {
  const { org, repo } = ctx ?? {};
  if (!org || !repo) return;
  (async () => {
    const { loadIms } = await import('../../../../utils/ims.js');
    const token = (await loadIms())?.accessToken?.token;
    if (token) {
      await fetchWysiwygCookie({ org, repo, token }).catch(() => {});
    }
  })().catch(() => {});
}

export function createQuickEditGetToken() {
  return async () => {
    const { loadIms } = await import('../../../../utils/ims.js');
    return (await loadIms())?.accessToken?.token ?? null;
  };
}

export function wireQuickEditControllerPort(controllerCtx) {
  controllerCtx.port.onmessage = createControllerOnMessage(controllerCtx);
  const sendInitialBodyAndCursors = () => {
    if (!controllerCtx.port) return;
    updateDocument(controllerCtx);
    updateCursors(controllerCtx);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(sendInitialBodyAndCursors);
  });
}
