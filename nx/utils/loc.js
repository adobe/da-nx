import getElementMetadata from '../../nx2/utils/getElementMetadata.js';
import { regionalDiff, removeLocTags } from '../blocks/loc/regional-diff/diff.js';

const DEFAULT_TIMEOUT = 20000;
const DA_METADATA_SELECTOR = 'body > .da-metadata';
const VERSION_SAVE_EXTS = new Set(['json', 'html']);

function saveDaSource({
  url, body, contentType, fetch,
}) {
  const formData = new FormData();
  formData.append('data', new Blob([body], { type: contentType }));
  return fetch(url, { method: 'POST', body: formData });
}

function responseError(response, operation) {
  return Object.assign(new Error(`${operation} failed (${response.status})`), { status: response.status });
}

export function createConfigLoader({ fetch, daOrigin }) {
  const cache = new Map();
  return ({ org, site }) => {
    if (!org || !site) throw new TypeError('Translation configuration requires org and site');
    const key = `${org}/${site}`;
    if (!cache.has(key)) {
      const promise = (async () => {
        const paths = [`/${org}/${site}/.da/translate.json`, `/${org}/.da/translate.json`];
        for (const path of paths) {
          const response = await fetch(`${daOrigin}/source${path}`);
          if (response.ok) return response.json();
          if (response.status !== 404) throw responseError(response, 'Translation configuration');
        }
        return { config: { data: [] } };
      })().catch((error) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, promise);
    }
    return cache.get(key);
  };
}

export function createCopy({
  fetch, loadConfig, daOrigin, saveSource,
}) {
  if (typeof fetch !== 'function' || typeof loadConfig !== 'function' || !daOrigin) {
    throw new TypeError('Copy requires authenticated fetch, loadConfig, and daOrigin');
  }
  const parser = new DOMParser();
  const versionSaving = new Map();

  const fail = (url, error) => {
    url.status = 'error';
    return { ok: false, status: error.status || 500, error: error.message };
  };

  const saveVersion = (path, label) => {
    if (!VERSION_SAVE_EXTS.has(path.split('.').pop()?.toLowerCase())) return undefined;
    if (!versionSaving.has(path)) {
      const promise = fetch(`${daOrigin}/versionsource${path}`, {
        method: 'POST', body: JSON.stringify({ label }),
      }).then((response) => {
        if (!response.ok) throw responseError(response, 'Version save');
      }).finally(() => versionSaving.delete(path));
      versionSaving.set(path, promise);
    }
    return versionSaving.get(path);
  };

  const getHtml = async (path, content) => {
    let text = content;
    if (!text) {
      const response = await fetch(`${daOrigin}/source${path}`);
      if (response.status === 404) return null;
      if (!response.ok) throw responseError(response, 'Source read');
      text = await response.text();
    }
    if (!text) return null;
    const collapsed = text.replace(/>([^<]*)</g, (match, value) => (
      value.trim() ? `>${value.replace(/\s+/g, ' ')}<` : match
    ));
    return parser.parseFromString(collapsed, 'text/html');
  };

  const saveHtml = (url, content, daMetadata = {}) => {
    const [, org, site, ...parts] = url.destination.split('/');
    const metadata = Object.entries(daMetadata).map(([key, value]) => (
      `<div><div>${key}</div><div>${value?.text ?? value ?? ''}</div></div>`
    )).join('');
    const body = `
      <body>
        <header></header>
        <main>${content}</main>
        ${metadata ? `\n  <div class="da-metadata">${metadata}</div>\n` : ''}<footer></footer>
      </body>
    `;
    const path = `/${parts.join('/').replace('.html', '')}.html`;
    if (saveSource) return saveSource({ org, site, path, body });
    return saveDaSource({
      url: `${daOrigin}/source/${org}/${site}${path}`,
      body,
      contentType: 'text/html',
      fetch,
    });
  };

  const overwriteCopy = async (url, title) => {
    try {
      let response;
      if (url.sourceContent) {
        response = await saveDaSource({
          url: `${daOrigin}/source${url.destination}`,
          body: url.sourceContent,
          contentType: url.destination.includes('.json') ? 'application/json' : 'text/html',
          fetch,
        });
      } else {
        const source = await getHtml(url.source);
        if (!source) throw new Error('Source content not found');
        removeLocTags(source);
        const metadata = getElementMetadata(source.querySelector(DA_METADATA_SELECTOR));
        delete metadata.acceptedhashes;
        delete metadata.rejectedhashes;
        response = await saveHtml(url, source.querySelector('main').innerHTML, metadata);
      }
      if (!response.ok) {
        url.status = 'error';
        return response;
      }
      await saveVersion(url.destination, `${title} - Rolled Out`);
      url.status = 'success';
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };

  const prepareDiff = async ({ url, useSourceContent, normalizeImages }) => {
    const regional = await getHtml(url.destination);
    const main = regional?.querySelector('body > main');
    if (!main || main.innerHTML === '' || main.innerHTML === '<div></div>') return { missing: true };
    const source = await getHtml(url.source, useSourceContent ? url.sourceContent : undefined);
    if (!source) throw new Error('Source content not found');
    removeLocTags(regional);
    removeLocTags(source);
    if (source.body.outerHTML === regional.body.outerHTML) return { same: true };
    const metadata = getElementMetadata(regional.querySelector(DA_METADATA_SELECTOR));
    const acceptedHashes = metadata.acceptedhashes?.text?.split(',') || [];
    const rejectedHashes = metadata.rejectedhashes?.text?.split(',') || [];
    const [, org, site] = url.destination.split('/');
    const config = await loadConfig({ org, site });
    if (config?.error) throw new Error(config.error);
    const diffed = await regionalDiff({
      original: source,
      modified: regional,
      acceptedHashes,
      rejectedHashes,
      site,
      config,
      normalizeImages,
    });
    return { diffed, metadata };
  };

  const applyLabels = (metadata, { labelLocal, labelUpstream }) => {
    if (labelLocal) metadata['diff-label-local'] = labelLocal;
    if (labelUpstream) metadata['diff-label-upstream'] = labelUpstream;
  };

  const mergeCopy = async (url, title, options = {}) => {
    try {
      const result = await prepareDiff({
        url, useSourceContent: true, normalizeImages: url.normalizeImages,
      });
      if (result.missing) return overwriteCopy(url, title);
      if (result.same) {
        url.status = 'success';
        return { ok: true };
      }
      applyLabels(result.metadata, options);
      const response = await saveHtml(url, result.diffed.innerHTML, result.metadata);
      if (response.ok) await saveVersion(url.destination, `${title} - Rolled Out`);
      url.status = response.ok ? 'success' : 'error';
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };

  const rolloutCopy = async (url, title, options = {}) => {
    try {
      const result = await prepareDiff({ url });
      if (result.missing) return overwriteCopy(url, title);
      if (result.same) {
        url.status = 'success';
        return undefined;
      }
      applyLabels(result.metadata, options);
      return await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          url.status = 'timeout';
          resolve('timeout');
        }, DEFAULT_TIMEOUT);
        saveHtml(url, result.diffed.innerHTML, result.metadata).then(async (response) => {
          if (response.ok) await saveVersion(url.destination, `${title} - Rolled Out`);
          url.status = response.ok ? 'success' : 'error';
          clearTimeout(timeout);
          resolve(response);
        }).catch((error) => {
          clearTimeout(timeout);
          resolve(fail(url, error));
        });
      });
    } catch (error) {
      return fail(url, error);
    }
  };

  return { mergeCopy, overwriteCopy, rolloutCopy };
}
