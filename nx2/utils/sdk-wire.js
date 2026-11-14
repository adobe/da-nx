export const SDK_VERSION = 2;

export const MSG = {
  HELLO: 'da-sdk:hello',
  INIT: 'da-sdk:init',
  FETCH: 'fetch',
  ABORT: 'abort',
  RESPONSE: 'response',
  ERROR: 'error',
  CLOSE: 'close',
};

export const ERROR_CODES = ['denied', 'unauthenticated', 'network', 'bad-request', 'unsupported', 'closed'];

/**
 * @typedef {'stream' | 'bytes'} AcceptMode
 *
 * @typedef {Object} WireRequest
 * @property {string} url Absolute http(s) URL.
 * @property {string} method GET, HEAD, POST, PUT or DELETE.
 * @property {[string, string][]} headers
 * @property {ArrayBuffer | null} body
 * @property {AcceptMode} accept
 *
 * @typedef {Object} WireResponse
 * @property {number} status
 * @property {string} statusText
 * @property {[string, string][]} headers
 * @property {ReadableStream | ArrayBuffer | null} body
 *
 * @typedef {Object} WireError
 * @property {string} code One of ERROR_CODES.
 * @property {string} message
 *
 * @typedef {{ type: 'da-sdk:hello', v: 2, nonce: string }} HelloMessage
 * @typedef {{ type: 'da-sdk:init', v: 2, nonce: string, context: Object }} InitMessage
 * @typedef {{ type: 'fetch', id: number, req: WireRequest }} FetchMessage
 * @typedef {{ type: 'abort', id: number }} AbortMessage
 * @typedef {{ type: 'response', id: number, res: WireResponse }} ResponseMessage
 * @typedef {{ type: 'error', id: number, error: WireError }} ErrorMessage
 * @typedef {{ type: 'close' }} CloseMessage Host to extension, the last message on the port.
 */

export class DaFetchError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'DaFetchError';
    this.code = code;
  }
}

export const canTransferStreams = (() => {
  let result;

  const probe = () => {
    const { port1, port2 } = new MessageChannel();
    try {
      const stream = new ReadableStream();
      port1.postMessage(stream, [stream]);
      return true;
    } catch {
      return false;
    } finally {
      port1.close();
      port2.close();
    }
  };

  return () => {
    result ??= probe();
    return result;
  };
})();
