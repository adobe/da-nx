import { env } from '../scripts/nx.js';

export const SUPPORTED_FILES = {
  html: 'text/html',
  jpeg: 'image/jpeg',
  json: 'application/json',
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

// Default dev to use stage servers
const DA_DEFAULT_ENV = env === 'dev' ? 'stage' : env;

const DA_ADMIN_ENVS = {
  dev: 'http://localhost:8787',
  stage: 'https://stage-admin.da.live',
  prod: 'https://admin.da.live',
};

const DA_COLLAB_ENVS = {
  dev: 'ws://localhost:4711',
  stage: 'wss://stage-collab.da.live',
  prod: 'wss://collab.da.live',
};

const DA_CONTENT_ENVS = {
  dev: 'http://localhost:8788',
  stage: 'https://stage-content.da.live',
  prod: 'https://content.da.live',
};

const DA_LIVE_PREVIEW_ENVS = {
  dev: 'https://localhost:8000',
  stage: 'https://stage-preview.da.live',
  prod: 'https://preview.da.live',
};

const DA_ETC_ENVS = {
  dev: 'http://localhost:8787',
  prod: 'https://da-etc.adobeaem.workers.dev',
};

function getEnv(key, envs) {
  const params = new URLSearchParams(window.location.search);
  const query = params.get(key);
  if (query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  const override = localStorage.getItem(key);
  return envs[override] || envs[DA_DEFAULT_ENV];
}

export const DA_ADMIN = getEnv('da-admin', DA_ADMIN_ENVS);
export const DA_COLLAB = getEnv('da-collab', DA_COLLAB_ENVS);
export const DA_CONTENT = getEnv('da-content', DA_CONTENT_ENVS);
export const DA_PREVIEW = getEnv('da-preview', DA_LIVE_PREVIEW_ENVS);
export const DA_ETC = getEnv('da-etc', DA_ETC_ENVS);

export const HLX_ADMIN = 'https://admin.hlx.page';
export const AEM_API = 'https://api.aem.live';

export const ALLOWED_TOKEN = [
  DA_ADMIN,
  DA_COLLAB,
  DA_CONTENT,
  DA_PREVIEW,
  DA_ETC,
  AEM_API,
  HLX_ADMIN,
];

const parseWindowPath = () => {
  const pathView = window.location.pathname.slice(1);
  const view = pathView === '' ? 'browse' : pathView;

  if (location.hash.endsWith('/index')) {
    const clean = location.hash.slice(0, -5);
    history.replaceState(null, '', clean);
  }

  const hashPath = location.hash.slice(2);
  if (!hashPath) return null;

  const [org, site, ...parts] = hashPath.split('/');
  if (!org || (parts.length && !site)) return null;

  const path = parts.join('/') || null;

  return { view, org, site: site || null, path };
};

export const hashChange = (() => {
  const listeners = new Set();

  window.addEventListener('hashchange', () => {
    const pathDetails = parseWindowPath();
    listeners.forEach((fn) => fn(pathDetails));
  });

  return {
    subscribe(fn) {
      listeners.add(fn);
      fn(parseWindowPath());
      return () => listeners.delete(fn);
    },
  };
})();

export const loadStyle = (() => {
  const cache = {};

  return (supplied) => {
    // Convenience replacement for WCs
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
