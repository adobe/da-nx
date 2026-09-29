// Handshake timeout — generous relative to the ~750ms delay the reference
// host implementation (nx/blocks/shell/shell.js) waits before it posts its
// first message, to leave headroom for slower message delivery.
const HANDSHAKE_TIMEOUT_MS = 1500;

// Module-level state. Deliberately not reset-able from the outside — see
// host-auth.md ("Lifecycle") for why.
let port;
let context;
let accessToken;

function applyHostMessage(data) {
  if (!data) return;
  if (data.context) context = data.context;
  if (data.token) accessToken = { token: data.token };
}

// Only a message carrying BOTH `ready: true` and a transferred port is
// trusted as the host handshake. This content-based check (borrowed from
// nx1's DA_SDK, nx/utils/sdk.js) is what lets us safely ignore stray
// `message` events from devtools, browser extensions, analytics scripts,
// etc. that could otherwise race the real handshake.
function isHandshake(e) {
  return !!(e.data?.ready && e.ports?.length);
}

function startHandshake() {
  return new Promise((resolve) => {
    let settled = false;

    function onMessage(e) {
      if (settled || !isHandshake(e)) return;
      settled = true;
      window.removeEventListener('message', onMessage);

      [port] = e.ports;
      applyHostMessage(e.data);

      // Once the handshake has been adopted, stop listening on the global
      // `window` for anything else. All further communication (e.g. a
      // refreshed token) happens over the dedicated port instead. This is
      // the fix for the bug in nx1's DA_SDK, where a single unscoped
      // `window` listener keeps handling every subsequent message for the
      // lifetime of the page, and — for calls like `getSelection()` — a
      // reply meant for one caller can be picked up by a different
      // caller's identically-shaped listener.
      port.onmessage = ({ data }) => applyHostMessage(data);

      resolve({ isEmbedded: true });
    }

    window.addEventListener('message', onMessage);

    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      resolve({ isEmbedded: false });
    }, HANDSHAKE_TIMEOUT_MS);
  });
}

// Single-flight memoized handshake promise. Every caller (initHostAuth,
// getHostContext, getAccessToken, setHash) awaits the same in-flight
// promise instead of racing independent handshake attempts.
let handshake;

/**
 * Detects whether this page is embedded inside a host that supports the
 * handshake (e.g. da.live's app shell), and completes the handshake if so.
 * Safe to call from anywhere, any number of times — the underlying
 * handshake only ever runs once per page load.
 * @returns {Promise<{ isEmbedded: boolean }>}
 */
export function initHostAuth() {
  handshake ??= startHandshake();
  return handshake;
}

/**
 * @returns {Promise<object|undefined>} The context the host supplied
 * (e.g. view, org, repo, ref, path), or `undefined` when standalone.
 */
export async function getHostContext() {
  await initHostAuth();
  return context;
}

/**
 * @returns {Promise<{ token: string }|undefined>} The IMS access token
 * supplied by the host, or `undefined` when standalone (or when the host
 * hasn't sent one yet).
 */
export async function getAccessToken() {
  await initHostAuth();
  return accessToken;
}

/**
 * Asks the host to update its address bar's location hash. No-op when
 * standalone.
 * @param {string} hash
 */
export async function setHash(hash) {
  await initHostAuth();
  port?.postMessage({ action: 'setHash', details: hash });
}
