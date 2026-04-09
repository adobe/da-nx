export { DA_ORIGIN, daFetch } from './daFetch.js';

const parse = (location = window.location) => {
  const pathView = location.pathname.slice(1);
  const view = pathView === '' ? 'browse' : pathView;

  const hashPath = location.hash.slice(2);
  const [org, site, ...parts] = hashPath.split('/');
  // split can result in empty strings,
  // so force them to undefined
  return {
    view,
    org: org || undefined,
    site: site || undefined,
    path: parts?.join('/') || undefined,
  };
};

/**
 * Shared observable for hash changes.
 * @type {{ subscribe: (fn: (hash: string) => void) => (() => void) }}
 */
export const hashChange = (() => {
  const listeners = new Set();

  window.addEventListener('hashchange', () => {
    const state = parse();
    listeners.forEach((fn) => fn(state));
  });

  return {
    subscribe(fn) {
      listeners.add(fn);
      fn(parse());
      return () => listeners.delete(fn);
    },
  };
})();

export class HashController {
  constructor(host) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {
    this._unsubscribe = hashChange.subscribe((state) => {
      this.value = state;
      this.host.requestUpdate();
    });
  }

  hostDisconnected() {
    this._unsubscribe();
  }
}

export const loadStyle = (() => {
  const cache = {};

  return (supplied) => {
    const path = supplied.replace('.js', '.css');

    try {
      cache[path] ??= import(path, { with: { type: 'css' } })
        .then(({ default: sheet }) => sheet);
    } catch {
      cache[path] ??= new Promise((resolve) => {
        (async () => {
          const resp = await fetch(path);
          const text = await resp.text();
          const sheet = new CSSStyleSheet();
          sheet.path = path;
          sheet.replaceSync(text);
          resolve(sheet);
        })();
      });
    }
    return cache[path];
  };
})();
