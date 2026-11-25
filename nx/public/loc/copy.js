const DEFAULT_TIMEOUT = 20000;
const VERSION_SAVE_EXTS = new Set(['json', 'html']);
const MARKED_VERSION_LABEL = 'Sync point set';
const NOT_ENABLED = 'Smart overwrite is not enabled for this site';
const CANONICALIZE_LOSS = 'canonicalize-loss';
const LOSS = 'Copying would lose content that the editor cannot keep.';

function lossMessage(url, side) {
  const page = { source: url.source, target: url.destination }[side];
  if (page) return `${LOSS} Open ${page} in the editor, save it, then copy again.`;
  if (side === 'source') return 'The source content has content that the editor cannot keep.';
  return `${LOSS} Open the source and the destination in the editor, save them, then copy again.`;
}
const SMART_OUTCOMES = { unchanged: 'unchanged', 'needs-review': 'review' };

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

const isHtmlPath = (path) => path.toLowerCase().endsWith('.html');

const isPagePath = (path) => isHtmlPath(path) || !path.split('/').pop().includes('.');

function requireRecordBaseline(method, options) {
  if (typeof options?.recordBaseline !== 'boolean') {
    throw new TypeError(`${method} requires a recordBaseline boolean`);
  }
}

let loadingEngine;
const loadEngine = () => {
  loadingEngine ??= import('./da-merge.js').catch((error) => {
    loadingEngine = undefined;
    throw error;
  });
  return loadingEngine;
};

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
  const versionSaving = new Map();

  const fail = (url, error) => {
    url.status = 'error';
    const message = error.code === CANONICALIZE_LOSS ? lossMessage(url, error.side) : error.message;
    url.error = `${url.destination}: ${message}`;
    return {
      ok: false,
      status: error.status || 500,
      error: message,
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

  const readText = async (path) => {
    const response = await fetch(`${daOrigin}/source${path}`);
    if (response.status === 404) return null;
    if (!response.ok) throw responseError(response, `Reading ${path}`);
    return response.text();
  };

  const readSource = async (url) => {
    const text = url.sourceContent || url.sourceHtml || await readText(url.source);
    if (!text) throw new Error('Source content not found');
    return text;
  };

  const setSaveStatus = (url, response) => {
    url.status = response.ok ? 'success' : 'error';
    if (!response.ok) url.error = `${url.destination}: Save failed (${response.status})`;
  };

  const saveHtml = (url, body) => {
    const [, org, site, ...parts] = url.destination.split('/');
    const rest = `/${parts.join('/')}`;
    const path = isHtmlPath(rest) ? rest : `${rest}.html`;
    if (saveSource) return saveSource({ org, site, path, body });
    return saveDaSource({
      url: `${daOrigin}/source/${org}/${site}${path}`,
      body,
      contentType: 'text/html',
      fetch,
    });
  };

  const getConfig = async (destination) => {
    const [, org, site] = destination.split('/');
    const config = await loadConfig({ org, site });
    if (config?.error) throw new Error(config.error);
    return { site, config };
  };

  const shouldRecord = async (url, recordBaseline, { configErrorOptsOut = false } = {}) => {
    const { isSnapshotPath } = await loadEngine();
    if (!recordBaseline || !isHtmlPath(url.destination) || isSnapshotPath(url.destination)) {
      return false;
    }
    try {
      return !!isSmartOverwriteEnabled((await getConfig(url.destination)).config);
    } catch (error) {
      if (!configErrorOptsOut) throw error;
      // eslint-disable-next-line no-console
      console.warn(`${url.destination}: overwriting without a sync point (${error.message})`);
      return false;
    }
  };

  const applyCopy = async (url, {
    behavior, recordBaseline, labels, config: knownConfig,
  }) => {
    const { engine } = await loadEngine();
    const [, , site] = url.destination.split('/');
    const smart = behavior === 'smart-overwrite';
    const sourceFirst = smart ? await readSource(url) : undefined;
    const targetText = behavior === 'overwrite' ? null : await readText(url.destination);
    if (smart && targetText !== null && !targetText.trim()) {
      throw new Error('Unexpected destination content');
    }
    const target = targetText || null;
    const source = sourceFirst ?? await readSource(url);
    const needsConfig = recordBaseline || !!target;
    const config = knownConfig
      ?? (needsConfig ? (await getConfig(url.destination)).config : {});
    return engine.applyCopy({
      source,
      target,
      behavior,
      path: url.destination,
      sourcePath: url.source,
      site,
      config,
      recordBaseline,
      labels: { local: labels?.labelLocal, upstream: labels?.labelUpstream },
      normalizeImages: url.normalizeImages,
    });
  };

  const saveResult = async (url, title, { html, report }, save = saveHtml) => {
    if (!html) {
      url.status = 'success';
      return { ok: true };
    }
    const response = await save(url, html);
    if (response.timeout) return response;
    if (!response.ok) {
      setSaveStatus(url, response);
      return response;
    }
    if (report.contentChanged) await saveVersion(url.destination, `${title} - Rolled Out`);
    url.status = 'success';
    return response;
  };

  const rawCopy = async (url, title) => {
    const response = await saveDaSource({
      url: `${daOrigin}/source${url.destination}`,
      body: await readSource(url),
      contentType: url.destination.includes('.json') ? 'application/json' : 'text/html',
      fetch,
    });
    if (response.ok) await saveVersion(url.destination, `${title} - Rolled Out`);
    setSaveStatus(url, response);
    return response;
  };

  const overwriteCopy = async (url, title, options) => {
    requireRecordBaseline('overwriteCopy', options);
    try {
      delete url.outcome;
      if (!isPagePath(url.destination)) return await rawCopy(url, title);
      const recordBaseline = await shouldRecord(url, options.recordBaseline, {
        configErrorOptsOut: true,
      });
      const result = await applyCopy(url, {
        behavior: 'overwrite', recordBaseline, labels: options,
      });
      return await saveResult(url, title, result);
    } catch (error) {
      return fail(url, error);
    }
  };

  const mergeCopy = async (url, title, options) => {
    requireRecordBaseline('mergeCopy', options);
    try {
      delete url.outcome;
      if (!isPagePath(url.destination)) return await rawCopy(url, title);
      const recordBaseline = await shouldRecord(url, options.recordBaseline);
      const result = await applyCopy(url, { behavior: 'merge', recordBaseline, labels: options });
      return await saveResult(url, title, result);
    } catch (error) {
      return fail(url, error);
    }
  };

  const saveWithTimeout = (url, body) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      url.status = 'timeout';
      resolve({ ok: false, timeout: true });
    }, DEFAULT_TIMEOUT);
    saveHtml(url, body).then(resolve, reject).finally(() => clearTimeout(timeout));
  });

  const rolloutCopy = async (url, title, options = {}) => {
    try {
      if (!isPagePath(url.destination)) return await rawCopy(url, title);
      const result = await applyCopy(url, { behavior: 'merge', recordBaseline: false, labels: options });
      const response = await saveResult(url, title, result, saveWithTimeout);
      if (response.timeout) return 'timeout';
      return result.html ? response : undefined;
    } catch (error) {
      return fail(url, error);
    }
  };

  const smartOverwriteCopy = async (url, title) => {
    delete url.outcome;
    delete url.reordered;
    try {
      const { config } = await getConfig(url.destination);
      if (!isSmartOverwriteEnabled(config)) throw new Error(NOT_ENABLED);
      const result = await applyCopy(url, { behavior: 'smart-overwrite', config });
      const response = await saveResult(url, title, result);
      if (!response.ok) return fail(url, responseError(response, 'Save'));
      const { report } = result;
      url.skipped = report.skipped;
      const outcome = SMART_OUTCOMES[report.outcome];
      if (outcome) url.outcome = outcome;
      if (report.reordered) url.reordered = true;
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };

  const setSync = (url, sync, extra = {}) => {
    Object.assign(url, { status: 'success', sync, ...extra });
    return { ok: true };
  };

  const markInSync = async (url, { dryRun = false } = {}) => {
    try {
      delete url.sync;
      delete url.differences;
      delete url.error;
      const { engine, isSnapshotPath } = await loadEngine();
      if (!isHtmlPath(url.destination)) return setSync(url, 'sheet');
      if (isSnapshotPath(url.destination)) return setSync(url, 'snapshot');
      const { site, config } = await getConfig(url.destination);
      if (!isSmartOverwriteEnabled(config)) throw new Error(NOT_ENABLED);
      const target = await readText(url.destination);
      if (!target) return setSync(url, 'missing');
      const source = await readSource(url);
      const latest = await readText(url.destination);
      const result = await engine.markInSync({
        source, target: latest, path: url.destination, site, config, dryRun,
      });
      if (result.sync !== 'marked') {
        return setSync(url, result.sync, result.sync === 'to-mark' ? { differences: result.differences } : {});
      }
      const response = await saveHtml(url, result.html);
      if (!response.ok) return fail(url, responseError(response, 'Save'));
      await saveVersion(url.destination, MARKED_VERSION_LABEL);
      setSync(url, 'marked');
      return response;
    } catch (error) {
      return fail(url, error);
    }
  };

  return {
    mergeCopy,
    overwriteCopy,
    rolloutCopy,
    smartOverwriteCopy,
    markInSync,
  };
}
