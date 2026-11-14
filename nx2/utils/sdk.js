import {
  MSG, SDK_VERSION, DaFetchError, canTransferStreams,
} from './sdk-wire.js';

export { DaFetchError };

const HELLO_INTERVAL = 100;
const HELLO_TIMEOUT = 3000;
const NULL_BODY_STATUS = [101, 103, 204, 205, 304];
const NO_BODY_METHODS = ['GET', 'HEAD'];

const cancelBody = (body) => {
  if (body instanceof ReadableStream) body.cancel().catch(() => {});
};

// Lets the caller's signal error the body after the headers arrived, as fetch does.
const guardBody = ({ body, signal, onEnd }) => {
  const reader = (body instanceof ReadableStream ? body : new Response(body).body).getReader();
  let controller;
  const onAbort = () => {
    controller.error(signal.reason);
    reader.cancel(signal.reason).catch(() => {});
  };
  const finish = () => {
    signal.removeEventListener('abort', onAbort);
    onEnd();
  };
  return new ReadableStream({
    start(c) {
      controller = c;
      signal.addEventListener('abort', onAbort, { once: true });
    },
    async pull(c) {
      try {
        const { done, value } = await reader.read();
        if (signal.aborted) return;
        if (done) {
          finish();
          c.close();
        } else {
          c.enqueue(value);
        }
      } catch (e) {
        finish();
        c.error(e);
      }
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
};

const toResponse = ({ res, signal, onEnd }) => {
  const { status, statusText, headers, body } = res;
  const init = { status, statusText, headers };
  if (!body || NULL_BODY_STATUS.includes(status)) {
    cancelBody(body);
    onEnd();
    return new Response(null, init);
  }
  const guarded = guardBody({ body, signal, onEnd });
  try {
    return new Response(guarded, init);
  } catch (e) {
    guarded.cancel().catch(() => {});
    throw e;
  }
};

/**
 * Create the extension side `daFetch` for a host port.
 * @param {{ port: MessagePort, accept?: 'stream' | 'bytes' }} options
 */
export function createDaFetch({ port, accept = canTransferStreams() ? 'stream' : 'bytes' }) {
  const pending = new Map();
  let lastId = 0;
  let closed = false;

  const take = (id) => {
    const entry = pending.get(id);
    if (!entry) return undefined;
    pending.delete(id);
    return entry;
  };

  const closeAll = () => {
    closed = true;
    [...pending.keys()].forEach((id) => {
      const entry = take(id);
      entry.release();
      entry.reject(new DaFetchError('closed', 'The host closed the connection'));
    });
    port.close();
  };

  port.addEventListener('message', ({ data }) => {
    if (data?.type === MSG.CLOSE) {
      closeAll();
      return;
    }
    if (data?.type !== MSG.RESPONSE && data?.type !== MSG.ERROR) return;
    const entry = take(data.id);
    if (!entry) {
      cancelBody(data.res?.body);
      return;
    }
    if (data.type === MSG.ERROR) {
      entry.release();
      entry.reject(new DaFetchError(data.error?.code ?? 'network', data.error?.message));
      return;
    }
    try {
      entry.resolve(toResponse({ res: data.res, signal: entry.signal, onEnd: entry.release }));
    } catch (e) {
      entry.release();
      cancelBody(data.res?.body);
      entry.reject(new DaFetchError('network', e.message));
    }
  });
  port.start();

  return async (input, init) => {
    const request = (() => {
      try {
        return new Request(input, init);
      } catch (e) {
        throw new DaFetchError('bad-request', e.message);
      }
    })();
    const { signal } = request;
    signal.throwIfAborted();

    const body = NO_BODY_METHODS.includes(request.method) ? null : await request.arrayBuffer();
    signal.throwIfAborted();
    if (closed) throw new DaFetchError('closed', 'The host closed the connection');

    lastId += 1;
    const id = lastId;
    return new Promise((resolve, reject) => {
      // Stays attached until the response body ends, so a late abort still reaches the host.
      const onAbort = () => {
        take(id);
        port.postMessage({ type: MSG.ABORT, id });
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      pending.set(id, {
        resolve,
        reject,
        signal,
        release: () => signal.removeEventListener('abort', onAbort),
      });
      const req = {
        url: request.url,
        method: request.method,
        headers: [...request.headers],
        body,
        accept,
      };
      port.postMessage({ type: MSG.FETCH, id, req }, body ? [body] : []);
    });
  };
}

const connect = () => new Promise((resolve, reject) => {
  if (window.parent === window) {
    reject(new DaFetchError('unsupported', 'The extension is not framed by a host'));
    return;
  }

  const nonce = crypto.randomUUID();
  const started = Date.now();
  const done = new AbortController();

  const tick = () => {
    if (Date.now() - started >= HELLO_TIMEOUT) {
      done.abort();
      reject(new DaFetchError('unsupported', 'No SDK2 host answered'));
      return;
    }
    window.parent.postMessage({ type: MSG.HELLO, v: SDK_VERSION, nonce }, '*');
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const { data } = e;
    if (data?.type !== MSG.INIT || data.v !== SDK_VERSION || data.nonce !== nonce) return;
    if (e.ports.length !== 1) return;
    done.abort();
    resolve({ context: data.context, daFetch: createDaFetch({ port: e.ports[0] }) });
  }, { signal: done.signal });

  const interval = setInterval(tick, HELLO_INTERVAL);
  done.signal.addEventListener('abort', () => clearInterval(interval));
  tick();
});

const DA_SDK = connect();
DA_SDK.catch(() => {});

export default DA_SDK;
