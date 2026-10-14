// Cross-repo canvas branch state (da.live imports via getNx2()).
// Paths are case-preserving `/org/site/document` paths from the canvas context,
// without adding an extension. REQUEST asks the bridge to replay its current STATE.
export const BRANCH_EVENT = Object.freeze({
  REQUEST: 'nx-branch-request', // { path }
  STATE: 'nx-branch-state', // { org, site, path, status: 'pending'|'ready'|'error', branch?, error? }
});

/** Wait for the authoritative canvas branch, including a bridge that loads later. */
export function requestCanvasBranch({ path, signal, timeout = 3000 }) {
  return new Promise((resolve, reject) => {
    let timer;
    let interval;
    let onState;
    let onAbort;
    const finish = (error, branch) => {
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener(BRANCH_EVENT.STATE, onState);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(branch);
    };
    onAbort = () => finish(new DOMException('Branch request cancelled.', 'AbortError'));
    onState = ({ detail }) => {
      if (detail?.path !== path) return;
      if (detail.status === 'error') finish(new Error(detail.error || 'Canvas branch unavailable.'));
      if (detail.status === 'ready' && typeof detail.branch === 'string' && detail.branch) {
        finish(null, detail.branch);
      }
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    const request = () => document.dispatchEvent(new CustomEvent(BRANCH_EVENT.REQUEST, {
      detail: { path },
    }));
    document.addEventListener(BRANCH_EVENT.STATE, onState);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(new Error('Canvas branch unavailable.')), timeout);
    interval = setInterval(request, 100);
    request();
  });
}
