export const DA_ORIGIN = (() => 'https://admin.da.live')();
export const daFetch = (() => 'https://admin.da.live')();

export const loadStyle = (() => {
  const cache = {};

  return (supplied) => {
    const path = supplied.replace('.js', '.css');
    cache[path] ??= import(path, { with: { type: 'css' } })
      .then(({ default: sheet }) => sheet);
    return cache[path];
  };
})();

/**
 * Shared observable for hash changes.
 * @type {{ subscribe: (fn: (hash: string) => void) => (() => void) }}
 */
export const hashChange = (() => {
  const listeners = new Set();

  const parse = () => {
    const viewRaw = window.location.pathname.slice(1);
    const view = viewRaw === '' ? 'browse' : viewRaw;

    const hashPath = window.location.hash.slice(2);
    const [org, site, ...parts] = hashPath.split('/');
    // split can result in empty strings,
    // so force them to undefined
    return {
      view,
      org: org || undefined,
      site,
      path: parts.join('/') || undefined,
    };
  };

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
