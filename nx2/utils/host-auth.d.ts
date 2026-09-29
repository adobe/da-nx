/**
 * Type declarations for nx2/utils/host-auth.js
 *
 * Detects whether the current page is embedded inside a host that speaks
 * the DA_SDK-style postMessage handshake (see nx/utils/sdk.js for the nx1
 * origin of the protocol, and nx/blocks/shell/shell.js for the reference
 * host-side implementation) and, if so, exposes the host-supplied IMS
 * access token and context.
 *
 * `nx2/utils/api.js`'s `daFetch` consults `getAccessToken()` before
 * falling back to `nx2/utils/ims.js`'s standalone `loadIms()` bootstrap.
 */

/** Result of the host-detection handshake. */
export interface HostAuthResult {
  /** Whether a host responded to the handshake before the timeout. */
  isEmbedded: boolean;
}

/** Context supplied by the host. Shape is host-defined; nx/blocks/shell/shell.js
 * sends `{ view, org, repo, ref, path, search, hash, daOrigin, imsOrigin }`. */
export type HostContext = Record<string, unknown>;

/** IMS access token supplied by the host. Same shape `daFetch` expects
 * from `ims.js`'s `loadIms()` return value's `accessToken` field. */
export interface HostAccessToken {
  token: string;
}

/**
 * Detects whether a host is present and completes the handshake if so.
 * Memoized: safe to call any number of times, from anywhere — only the
 * first call triggers the handshake; every caller shares one promise.
 */
export function initHostAuth(): Promise<HostAuthResult>;

/** Context supplied by the host, or `undefined` when standalone. */
export function getHostContext(): Promise<HostContext | undefined>;

/** IMS access token supplied by the host, or `undefined` when standalone
 * (or when the host hasn't sent one yet). */
export function getAccessToken(): Promise<HostAccessToken | undefined>;

/** Asks the host to update its address bar's location hash. No-op when
 * standalone. */
export function setHash(hash: string): Promise<void>;
