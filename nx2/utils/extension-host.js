import { daFetch, isHlx6 } from './api.js';
import {
  DA_ADMIN, DA_CONTENT, AEM_API, HLX_ADMIN,
} from './utils.js';
import { MSG, SDK_VERSION, canTransferStreams } from './sdk-wire.js';

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'];
const ACCEPT_MODES = ['stream', 'bytes'];
const HEADER_ALLOWLIST = ['accept', 'content-type', 'if-match', 'if-none-match'];
const NULL_BODY_STATUS = [101, 103, 204, 205, 304];
const READ = ['GET', 'HEAD'];
const WRITE = ['PUT', 'POST'];

/**
 * Default deny. `body` is 'none' (the default) or 'image-form', see checkBody.
 * Backends read commands from the body too (snapshot publish/review/delete, source copy,
 * media interning that forwards the token), so the body rule is part of each route.
 */
export const PROXY_POLICY = {
  [AEM_API]: [
    { path: '/{org}/sites/{site}/snapshots', methods: ['GET'] },
    { path: '/{org}/sites/{site}/snapshots/{id}', methods: ['GET'] },
    { path: '/{org}/sites/{site}/snapshots/{id}/{path+}', methods: ['POST'] },
    { path: '/{org}/sites/{site}/status/{path+}', methods: ['GET'] },
    { path: '/{org}/sites/{site}/source/{path+}', methods: READ },
  ],
  [HLX_ADMIN]: [
    { path: '/snapshot/{org}/{site}/main', methods: ['GET'] },
    { path: '/snapshot/{org}/{site}/main/{id}', methods: ['GET'] },
    { path: '/snapshot/{org}/{site}/main/{id}/{path+}', methods: ['POST'] },
    { path: '/status/{org}/{site}/main/{path+}', methods: ['GET'] },
  ],
  [DA_ADMIN]: [
    { path: '/source/{org}/{site}/{path+}', methods: READ },
    { path: '/source/{org}/{site}/{path+}', methods: WRITE, body: 'image-form' },
    { path: '/list/{org}/{site}/{path+}', methods: ['GET'], query: true },
  ],
  [DA_CONTENT]: [
    { path: '/{org}/{site}/{path+}', methods: READ, query: true },
  ],
};

const deny = (reason) => ({ ok: false, reason });

const isDotSegment = (segment) => ['.', '..'].includes(segment.toLowerCase().replaceAll('%2e', '.'));

// Admin APIs treat a trailing `/*` as a bulk operation on the whole folder.
const isWildcard = (segment) => segment.toLowerCase().replaceAll('%2a', '*') === '*';

const matchSegment = ({ pattern, segment, scope }) => {
  if (pattern === '{org}') return segment === scope.org;
  if (pattern === '{site}') return segment === scope.site;
  if (pattern.startsWith('{')) return segment !== '';
  return segment === pattern;
};

const matchPath = ({ pattern, segments, scope }) => {
  const parts = pattern.split('/').slice(1);
  const hasRest = parts.at(-1) === '{path+}';
  const fixed = hasRest ? parts.slice(0, -1) : parts;
  if (hasRest ? segments.length <= fixed.length : segments.length !== fixed.length) return false;
  const fixedOk = fixed.every((p, i) => matchSegment({ pattern: p, segment: segments[i], scope }));
  if (!fixedOk || !hasRest) return fixedOk;
  const rest = segments.slice(fixed.length);
  return rest.slice(0, -1).every((segment) => segment !== '');
};

/**
 * Check a proxied request against PROXY_POLICY. Pure.
 * @param {{ url: string, method: string, scope: { org: string, site: string } }} args
 * @returns {{ ok: true, url: URL, rule: Object } | { ok: false, reason: string }}
 */
export function authorize({ url, method, scope }) {
  if (!scope?.org || !scope?.site) return deny('Missing host scope');
  if (typeof url !== 'string' || typeof method !== 'string') return deny('Invalid request');

  const parsed = URL.canParse(url) ? new URL(url) : undefined;
  if (!parsed) return deny('Invalid URL');
  if (parsed.username || parsed.password) return deny('Credentials in URL are not allowed');

  const rawPath = url.slice(url.indexOf('//') + 2).split(/[?#]/)[0];
  if (rawPath.includes('\\')) return deny('Backslash in path');
  if (rawPath.split('/').some(isDotSegment)) return deny('Dot segment in path');
  if (/%2f|%5c/i.test(parsed.pathname)) return deny('Encoded slash in path');

  if (!Object.hasOwn(PROXY_POLICY, parsed.origin)) return deny(`Origin ${parsed.origin} is not allowed`);
  const rules = PROXY_POLICY[parsed.origin];

  const verb = method.toUpperCase();
  const segments = parsed.pathname.split('/').slice(1);
  if (segments.some(isWildcard)) return deny('Wildcard segment in path');
  const pathRules = rules.filter(({ path }) => matchPath({ pattern: path, segments, scope }));
  if (!pathRules.length) return deny(`Path ${parsed.pathname} is not allowed`);

  const rule = pathRules.find(({ methods }) => methods.includes(verb));
  if (!rule) return deny(`Method ${verb} is not allowed for ${parsed.pathname}`);
  if (parsed.search && !rule.query) return deny('Query is not allowed');

  parsed.hash = '';
  return { ok: true, url: parsed, rule };
}

const ALLOW = { ok: true };

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|avif)$/i;

const isEmpty = (body) => !body || body.byteLength === 0;

const readForm = ({ type, body }) => new Response(body, { headers: { 'content-type': type } })
  .formData()
  .catch(() => undefined);

const BODY_RULES = {
  none: async ({ body }) => (isEmpty(body) ? ALLOW : deny('Request body is not allowed')),
  'image-form': async ({ url, headers, body }) => {
    // The part type is client-chosen; the backend stores by path extension.
    if (!IMAGE_PATH.test(new URL(url).pathname)) return deny('Target path must be an image file');
    const type = headers['content-type'] ?? '';
    if (isEmpty(body) || !/^multipart\/form-data\s*;/i.test(type)) {
      return deny('Body must be multipart/form-data');
    }
    const entries = [...(await readForm({ type, body }) ?? [])];
    if (entries.length !== 1) return deny('Body must have exactly one field');
    const [[name, value]] = entries;
    if (name !== 'data' || !(value instanceof Blob)) return deny('Body field must be a file named data');
    if (!value.type.toLowerCase().startsWith('image/')) return deny('Body file must be an image');
    return ALLOW;
  },
};

/**
 * Check a parsed request body against the body rule of its matched policy rule. Pure.
 * @param {{
 *   rule: { body?: 'none' | 'image-form' },
 *   req: { headers: Object, body: ArrayBuffer | null },
 * }} args
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function checkBody({ rule, req }) {
  const check = BODY_RULES[rule.body ?? 'none'];
  if (!check) return deny(`Unknown body rule ${rule.body}`);
  return check(req);
}

const badRequest = (reason) => ({ ok: false, reason });

const isHeaderPair = (pair) => Array.isArray(pair)
  && pair.length === 2
  && pair.every((part) => typeof part === 'string' && !/[\r\n\0]/.test(part));

/**
 * Validate a wire request from the extension. Pure.
 * @returns {{ ok: true, req: { url, method, headers: Object, body, accept } }
 *   | { ok: false, reason: string }}
 */
export function parseWireRequest(raw) {
  if (!raw || typeof raw !== 'object') return badRequest('Request must be an object');
  const { url, method, headers, body, accept } = raw;

  if (typeof url !== 'string' || !URL.canParse(url)) return badRequest('URL must be absolute');
  if (!['http:', 'https:'].includes(new URL(url).protocol)) return badRequest('URL must be http(s)');

  const verb = typeof method === 'string' ? method.toUpperCase() : undefined;
  if (!METHODS.includes(verb)) return badRequest(`Method ${method} is not supported`);

  if (!Array.isArray(headers) || !headers.every(isHeaderPair)) return badRequest('Invalid headers');
  if (body !== null && !(body instanceof ArrayBuffer)) return badRequest('Body must be an ArrayBuffer or null');
  if (body && READ.includes(verb)) return badRequest(`${verb} cannot have a body`);
  if (!ACCEPT_MODES.includes(accept)) return badRequest('Invalid accept mode');

  const allowed = headers
    .map(([name, value]) => [name.toLowerCase(), value])
    .filter(([name]) => HEADER_ALLOWLIST.includes(name));

  return {
    ok: true,
    req: { url, method: verb, headers: Object.fromEntries(allowed), body, accept },
  };
}

const cancelBody = (resp) => resp.body?.cancel().catch(() => {});

/**
 * Serve proxied fetch requests on a port. Coexists with other handlers on the same port.
 * @param {MessagePort} port
 * @param {{ org: string, site: string }} scope
 * @returns {{ close: () => void }}
 */
export function serveFetch(port, scope) {
  const inflight = new Map();
  let closed = false;

  const isCurrent = (id, controller) => inflight.get(id) === controller;

  const sendError = ({ id, code, message }) => {
    port.postMessage({ type: MSG.ERROR, id, error: { code, message } });
  };

  const sendResponse = async ({ id, controller, resp, req }) => {
    const head = {
      status: resp.status,
      statusText: resp.statusText,
      headers: [...resp.headers],
    };

    if (!resp.body || req.method === 'HEAD' || NULL_BODY_STATUS.includes(resp.status)) {
      cancelBody(resp);
      inflight.delete(id);
      port.postMessage({ type: MSG.RESPONSE, id, res: { ...head, body: null } });
      return;
    }

    if (req.accept === 'stream' && canTransferStreams()) {
      const { readable, writable } = new TransformStream();
      port.postMessage({ type: MSG.RESPONSE, id, res: { ...head, body: readable } }, [readable]);
      // The extension can cancel the stream before its abort message arrives.
      resp.body.pipeTo(writable, { signal: controller.signal })
        .catch(() => controller.abort())
        .finally(() => { if (isCurrent(id, controller)) inflight.delete(id); });
      return;
    }

    const body = await resp.arrayBuffer();
    if (!isCurrent(id, controller)) return;
    inflight.delete(id);
    port.postMessage({ type: MSG.RESPONSE, id, res: { ...head, body } }, [body]);
  };

  const handleFetch = async ({ id, req: raw }) => {
    if (!Number.isInteger(id) || id <= 0 || inflight.has(id)) return;

    const parsed = parseWireRequest(raw);
    if (!parsed.ok) {
      sendError({ id, code: 'bad-request', message: parsed.reason });
      return;
    }
    const { req } = parsed;

    const checked = authorize({ url: req.url, method: req.method, scope });
    if (!checked.ok) {
      sendError({ id, code: 'denied', message: checked.reason });
      return;
    }

    const controller = new AbortController();
    inflight.set(id, controller);
    const body = await checkBody({ rule: checked.rule, req });
    if (!isCurrent(id, controller)) return;
    if (!body.ok) {
      inflight.delete(id);
      sendError({ id, code: 'denied', message: body.reason });
      return;
    }
    try {
      const opts = {
        method: req.method,
        headers: { ...req.headers },
        body: req.body,
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      };
      const resp = await daFetch({ url: checked.url.href, opts });
      if (!isCurrent(id, controller)) {
        cancelBody(resp);
        return;
      }
      if (!resp.status) {
        inflight.delete(id);
        sendError({ id, code: 'unauthenticated', message: 'The user is not signed in' });
        return;
      }
      await sendResponse({ id, controller, resp, req });
    } catch (e) {
      if (!isCurrent(id, controller)) return;
      inflight.delete(id);
      sendError({ id, code: 'network', message: e.message });
    }
  };

  const abort = (id) => {
    const controller = inflight.get(id);
    if (!controller) return;
    inflight.delete(id);
    controller.abort();
  };

  const onMessage = ({ data }) => {
    if (closed) return;
    if (data?.type === MSG.FETCH) handleFetch(data);
    if (data?.type === MSG.ABORT) abort(data.id);
  };

  port.addEventListener('message', onMessage);
  port.start();

  return {
    close() {
      if (closed) return;
      closed = true;
      port.removeEventListener('message', onMessage);
      [...inflight.keys()].forEach(abort);
      // Also settles requests the host never received, so the extension rejects them all.
      port.postMessage({ type: MSG.CLOSE });
    },
  };
}

const originOf = (src) => (src && URL.canParse(src, window.location.href)
  ? new URL(src, window.location.href).origin
  : undefined);

const buildContext = async (context) => {
  const {
    org, site, repo, ref, path, view,
  } = context;
  const hlx6 = await Promise.resolve(isHlx6(org, site)).catch(() => false);
  return {
    org, site, repo, ref, path, view, hlx6,
  };
};

/**
 * Accept the SDK2 handshake from an extension iframe and serve proxied fetches.
 * @param {{ iframe: HTMLIFrameElement, context: Object }} args
 * @returns {{ close: () => void }}
 */
export function connectExtension({ iframe, context }) {
  const scope = { org: context.org, site: context.site };
  let current;
  let closed = false;

  const disconnect = () => {
    if (!current) return;
    current.server.close();
    current.port.close();
    current = undefined;
  };

  const onMessage = async (e) => {
    if (e.source !== iframe.contentWindow) return;
    const expected = originOf(iframe.src);
    if (!expected || e.origin !== expected) return;
    if (e.origin === window.location.origin || e.origin === 'null') return;

    const { data } = e;
    if (data?.type !== MSG.HELLO || data.v !== SDK_VERSION) return;
    if (typeof data.nonce !== 'string' || !data.nonce) return;
    if (current?.nonce === data.nonce) return;

    disconnect();
    const { port1, port2 } = new MessageChannel();
    const connection = { nonce: data.nonce, port: port1, server: serveFetch(port1, scope) };
    current = connection;

    const initContext = await buildContext(context);
    if (closed || current !== connection) return;
    const init = {
      type: MSG.INIT, v: SDK_VERSION, nonce: data.nonce, context: initContext,
    };
    e.source.postMessage(init, e.origin, [port2]);
  };

  window.addEventListener('message', onMessage);

  return {
    close() {
      if (closed) return;
      closed = true;
      window.removeEventListener('message', onMessage);
      disconnect();
    },
  };
}
