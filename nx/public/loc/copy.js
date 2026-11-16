import getElementMetadata from '../../../nx2/utils/getElementMetadata.js';
import {
  regionalDiff, removeLocTags, LOC_MARKERS, isSnapshotPath,
} from './regional-diff.js';
import { ROLLOUT_BASE_KEY } from './hashes.js';

const DEFAULT_TIMEOUT = 20000;
const DA_METADATA_SELECTOR = 'body > .da-metadata';
const VERSION_SAVE_EXTS = new Set(['json', 'html']);
const NO_SYNC_POINT = 'no-sync-point';

function saveDaSource({
  url, body, contentType, fetch,
}) {
  const formData = new FormData();
  formData.append('data', new Blob([body], { type: contentType }));
  return fetch(url, { method: 'POST', body: formData });
}

export const isSmartOverwriteEnabled = (config) => (config?.config?.data || [])
  .find((row) => row.key === 'rollout.conflict.behavior')?.value
  ?.split(',').some((value) => value.trim() === 'smart-overwrite');

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
        const paths = [
          { path: `/${org}/${site}/.da/translate.json`, missing: [404] },
          { path: `/${org}/.da/translate.json`, missing: [403, 404] },
        ];
        for (const { path, missing } of paths) {
          const response = await fetch(`${daOrigin}/source${path}`);
          if (response.ok) return response.json();
          if (!missing.includes(response.status)) throw responseError(response, `Reading translation config ${path}`);
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
  fetch, daOrigin, loadConfig = createConfigLoader({ fetch, daOrigin }), saveSource,
}) {
  if (typeof fetch !== 'function' || typeof loadConfig !== 'function' || !daOrigin) {
    throw new TypeError('Copy requires authenticated fetch, loadConfig, and daOrigin');
  }
  const parser = new DOMParser();
  const versionSaving = new Map();

  const fail = (url, error) => {
    url.status = 'error';
    url.error = `${url.destination}: ${error.message}`;
    return {
      ok: false,
      status: error.status || 500,
      error: error.message,
      ...(typeof error.code === 'string' ? { code: error.code } : {}),
    };
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

  // `raw` skips whitespace collapsing, and an empty but successful read yields an empty document
  // (so smart overwrite can reject it) instead of being treated as missing.
  const getHtml = async (path, content, { raw = false } = {}) => {
    let text = content;
    if (!text) {
      const response = await fetch(`${daOrigin}/source${path}`);
      if (response.status === 404) return null;
      if (!response.ok) throw responseError(response, `Reading ${path}`);
      text = await response.text();
    }
    if (raw) {
      const doc = parser.parseFromString(text || '', 'text/html');
      // Lets a metadata-only write save the page in the shape it was read (full document or body).
      const doctype = /^\s*<!doctype/i.test(text || '');
      doc.sourceShape = { html: doctype || /<(html|head)[\s>]/i.test(text || ''), doctype };
      return doc;
    }
    if (!text) return null;
    const collapsed = text.replace(/>([^<]*)</g, (match, value) => (
      value.trim() ? `>${value.replace(/\s+/g, ' ')}<` : match
    ));
    return parser.parseFromString(collapsed, 'text/html');
  };

  const setSaveStatus = (url, response) => {
    url.status = response.ok ? 'success' : 'error';
    if (!response.ok) url.error = `${url.destination}: Save failed (${response.status})`;
  };

  const writeHtml = ({ url, body, exactPath }) => {
    const [, org, site, ...parts] = url.destination.split('/');
    const path = exactPath
      ? `/${parts.join('/')}`
      : `/${parts.join('/').replace('.html', '')}.html`;
    if (saveSource) return saveSource({ org, site, path, body });
    return saveDaSource({
      url: `${daOrigin}/source/${org}/${site}${path}`,
      body,
      contentType: 'text/html',
      fetch,
    });
  };

  const saveHtml = (url, content, daMetadata = {}) => {
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
    return writeHtml({ url, body });
  };

  // Baseline writes only target `.html` destinations, so the path is used exactly as given.
  const saveBody = (url, body) => writeHtml({ url, body, exactPath: true });

  let smart;
  const loadSmart = () => {
    smart ??= import('./smart-overwrite.js')
      .then(({ default: create }) => create({
        getHtml,
        loadConfig,
        saveHtml,
        saveBody,
        saveVersion,
        fail,
        responseError,
        isSmartOverwriteEnabled,
      }))
      .catch((error) => {
        smart = undefined;
        throw error;
      });
    return smart;
  };

  // `configErrorOptsOut`: plain overwrite never read the config, so an unreadable one opts out.
  const readRolloutConfig = async (destination, { configErrorOptsOut }) => {
    const [, org, site] = destination.split('/');
    try {
      const config = await loadConfig({ org, site });
      if (config?.error) throw new Error(config.error);
      return config;
    } catch (error) {
      if (!configErrorOptsOut) throw error;
      // eslint-disable-next-line no-console
      console.warn(`${destination}: overwriting without a sync point (${error.message})`);
      return null;
    }
  };

  // `recordBaseline`: rollout callers only, and only on sites that opted into smart-overwrite.
  const getSmartForRollout = async (url, { recordBaseline } = {}, { configErrorOptsOut } = {}) => {
    const { destination } = url;
    const isPage = destination.toLowerCase().endsWith('.html') && !isSnapshotPath(destination);
    if (!recordBaseline || !isPage) return null;
    const config = await readRolloutConfig(destination, { configErrorOptsOut });
    return isSmartOverwriteEnabled(config) ? loadSmart() : null;
  };

  const overwriteCopy = async (url, title, options = {}) => {
    try {
      let response;
      delete url.outcome;
      const smartRollout = await getSmartForRollout(url, options, { configErrorOptsOut: true });
      const withBaseline = smartRollout && await smartRollout.getOverwriteWithBaseline(url);
      if (withBaseline) {
        response = await saveBody(url, withBaseline.body);
      } else if (url.sourceContent) {
        response = await saveDaSource({
          url: `${daOrigin}/source${url.destination}`,
          body: url.sourceContent,
          contentType: url.destination.includes('.json') ? 'application/json' : 'text/html',
          fetch,
        });
      } else {
        const source = await getHtml(url.source, url.sourceHtml);
        if (!source) throw new Error('Source content not found');
        removeLocTags(source);
        const metadata = getElementMetadata(source.querySelector(DA_METADATA_SELECTOR));
        delete metadata.acceptedhashes;
        delete metadata.rejectedhashes;
        response = await saveHtml(url, source.querySelector('main').innerHTML, metadata);
      }
      if (!response.ok) {
        setSaveStatus(url, response);
        return response;
      }
      await saveVersion(url.destination, `${title} - Rolled Out`);
      url.status = 'success';
      if (smartRollout && !withBaseline) url.outcome = NO_SYNC_POINT;
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };

  const prepareDiff = async ({
    url, useSourceContent, normalizeImages, emptyIsMissing, sameMain,
  }) => {
    // With a baseline the page must keep code whitespace, as the baseline hashes count it.
    const raw = !!sameMain;
    const regional = await getHtml(url.destination, undefined, { raw });
    if (!regional) return { missing: true };
    const main = regional.querySelector('body > main');
    if (emptyIsMissing && (!main || main.innerHTML === '' || main.innerHTML === '<div></div>')) {
      return { missing: true };
    }
    const source = await getHtml(
      url.source,
      useSourceContent ? url.sourceContent || url.sourceHtml : undefined,
      { raw },
    );
    if (!source) throw new Error('Source content not found');
    const reviewed = !regional.querySelector(LOC_MARKERS);
    removeLocTags(regional);
    removeLocTags(source);
    const metadata = getElementMetadata(regional.querySelector(DA_METADATA_SELECTOR));
    // Whitespace-insensitive, like a merge without a baseline, so local spacing survives.
    const mainOf = (doc) => doc.querySelector('body > main')?.innerHTML.replace(/\s+/g, ' ');
    const sameBody = source.body.outerHTML === regional.body.outerHTML;
    if (sameBody && !sameMain) return { same: true, metadata };
    const sameContent = mainOf(source) === mainOf(regional);
    if (sameMain && reviewed && sameContent) return { same: true, metadata };
    const acceptedHashes = metadata.acceptedhashes?.text?.split(',') || [];
    const rejectedHashes = metadata.rejectedhashes?.text?.split(',') || [];
    const [, org, site] = url.destination.split('/');
    const config = await loadConfig({ org, site });
    if (config?.error) throw new Error(config.error);
    const diffed = await regionalDiff(source, regional, acceptedHashes, rejectedHashes, {
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

  // The merge and its baseline must come from the same source revision.
  const withSourceText = async (url) => {
    if (url.sourceContent || url.sourceHtml) return url;
    const response = await fetch(`${daOrigin}/source${url.source}`);
    if (response.status === 404) return url;
    if (!response.ok) throw responseError(response, `Reading ${url.source}`);
    const sourceHtml = await response.text();
    if (!sourceHtml) throw new Error('Source content not found');
    return { ...url, sourceHtml };
  };

  // `dropBaseline`: callers that can't record a baseline remove the page's (now stale) one.
  const mergeCopy = async (url, title, options = {}) => {
    try {
      delete url.outcome;
      const smartRollout = await getSmartForRollout(url, options);
      const sourceUrl = smartRollout ? await withSourceText(url) : url;
      const result = await prepareDiff({
        url: sourceUrl,
        useSourceContent: true,
        normalizeImages: url.normalizeImages,
        emptyIsMissing: true,
        sameMain: !!smartRollout,
      });
      if (result.missing) return overwriteCopy(url, title, options);
      const baseline = smartRollout && await smartRollout.getBaselineValue(sourceUrl);
      const noSyncPoint = smartRollout && !baseline;
      if (result.same) {
        const current = result.metadata[ROLLOUT_BASE_KEY]?.text;
        if (smartRollout && (baseline ? current !== baseline : current)) {
          const recorded = await smartRollout.recordBaseline(url, baseline);
          if (!recorded.ok) return fail(url, responseError(recorded, 'Save'));
        }
        url.status = 'success';
        if (noSyncPoint) url.outcome = NO_SYNC_POINT;
        return { ok: true };
      }
      if (baseline) result.metadata[ROLLOUT_BASE_KEY] = baseline;
      else if (smartRollout || options.dropBaseline) delete result.metadata[ROLLOUT_BASE_KEY];
      applyLabels(result.metadata, options);
      const response = await saveHtml(url, result.diffed.innerHTML, result.metadata);
      if (response.ok) await saveVersion(url.destination, `${title} - Rolled Out`);
      setSaveStatus(url, response);
      if (response.ok && noSyncPoint) url.outcome = NO_SYNC_POINT;
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
          setSaveStatus(url, response);
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

  const fromSmart = (method) => async (url, ...args) => {
    try {
      return (await loadSmart())[method](url, ...args);
    } catch (error) {
      return fail(url, error);
    }
  };

  return {
    mergeCopy,
    overwriteCopy,
    rolloutCopy,
    smartOverwriteCopy: fromSmart('smartOverwrite'),
    markInSync: fromSmart('markInSync'),
  };
}
