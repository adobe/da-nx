import makeBatches from '../../../../../nx2/public/utils/batch.js';

export const GLAAS_DEBUG_LOG_KEY = 'glaas.log';

export function shouldLogGLaaSRequests() {
  try {
    return localStorage.getItem(GLAAS_DEBUG_LOG_KEY) === 'true';
  } catch {
    return false;
  }
}

export async function throttle(ms = 500) {
  return new Promise((resolve) => {
    setTimeout(() => { resolve(); }, ms);
  });
}

export function getOpts(clientid, token, body, contentType, method = 'GET') {
  const opts = {
    method,
    headers: {
      'X-Glaas-Authtoken': token,
      'X-Glaas-Clientid': clientid,
    },
  };
  if (body) opts.body = body;
  if (contentType) opts.headers['Content-Type'] = contentType;
  return opts;
}

export async function checkSession({ origin, clientid, token }) {
  const opts = getOpts(clientid, token, null, null, 'POST');
  try {
    const resp = await fetch(`${origin}/api/common/v1.0/checkSession`, opts);
    return resp.status;
  } catch {
    return { error: 'Error checking session.' };
  }
}

async function getSha256InHex(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Shared callbackConfig + config for v1.2 and v2 multimodal task create. */
export async function buildGlaasCreateMetadata({ task, service }) {
  const { name, workflow, businessUnit } = task;
  const callbackConfig = [];
  const projectKeyKV = [];
  if (service?.preview) {
    const [product = '', project = ''] = workflow?.split('/') ?? [];
    const projectHash = await getSha256InHex(`${product}-${project}-${name}`);
    projectKeyKV.push({
      key: 'dalocProjectKey',
      value: `v1/${projectHash}`,
    });
    const hookUrl = `https://${service.preview}/api/v1/web/daloc/glaas-hook`;
    callbackConfig.push({ key: 'taskCallbackURL', value: hookUrl });
    callbackConfig.push({ key: 'assetCallbackURL', value: hookUrl });
  }
  const config = [{
    key: 'businessUnit',
    value: businessUnit,
  }, ...projectKeyKV];
  return { callbackConfig, config };
}

export async function createTask({ origin, clientid, token, task, service }) {
  const { name, workflowName, workflow, targetLocales } = task;
  const { callbackConfig, config } = await buildGlaasCreateMetadata({ task, service });

  const body = {
    name,
    targetLocales,
    workflowName,
    contentSource: 'Adhoc',
    callbackConfig,
    config,
  };

  const opts = getOpts(clientid, token, JSON.stringify(body), 'application/json', 'POST');

  try {
    const resp = await fetch(`${origin}/api/l10n/v1.2/tasks/${workflow}/create`, opts);
    if (!resp.ok) throw new Error(resp.status);
    return task;
  } catch (e) {
    return { error: 'Error creating task.', status: e };
  }
}

export async function getTask({
  origin, clientid, token, workflow, name, service,
}) {
  const apiOrigin = service?.origin ?? origin;
  const opts = getOpts(clientid, token);
  try {
    const resp = await fetch(`${apiOrigin}/api/l10n/v1.2/tasks/${workflow}/${name}`, opts);
    const json = await resp.json();
    return { status: resp.status, json };
  } catch {
    return { error: 'Error getting task.' };
  }
}

// Helper function to ensure GLaaS compatibility with json extensions are converted to html
export const getGlaasFilename = (daBasePath) => (daBasePath.endsWith('.html') ? daBasePath : `${daBasePath}.html`);

/** AEM preview URL for GLaaS (v1.2 metadata and v2 multimodal create). */
export function glaasSourcePreviewUrl(aemHref) {
  if (!aemHref) return undefined;
  return aemHref.replace(/\/index$/, '/');
}

async function readGlaasResponse(resp) {
  const { status, statusText } = resp;
  let body = '';
  try {
    body = await resp.text();
  } catch (error) {
    body = `[response read error: ${error?.message ?? error}]`;
  }
  let json;
  try {
    json = body ? JSON.parse(body) : undefined;
  } catch {
    json = undefined;
  }
  return { status, statusText, body, json };
}

function logGlaasAddAssetsRequest({
  url, workflow, taskName, targetLocales, fileDetails, assetMetadata, daBasePath,
}) {
  if (!shouldLogGLaaSRequests()) return;
  // eslint-disable-next-line no-console -- dev GLaaS handoff (glaas.log)
  console.info('[GLaaS addAssets] request', {
    daBasePath,
    url,
    workflow,
    taskName,
    targetLocales,
    fileDetails,
    assetMetadata: {
      assetName: assetMetadata.assetName,
      assetType: assetMetadata.assetType,
      targetLocales: assetMetadata.targetLocales,
      'source-preview-url': assetMetadata.metadata?.['source-preview-url'],
      ...(assetMetadata.langMetadata && { langMetadata: assetMetadata.langMetadata }),
      ...(assetMetadata.languageContext && { languageContext: assetMetadata.languageContext }),
    },
  });
  // eslint-disable-next-line no-console -- dev GLaaS handoff (glaas.log)
  console.info('[GLaaS addAssets] _asset_metadata_\n', JSON.stringify(assetMetadata, null, 2));
}

function logGlaasAddAssetsResponse({
  daBasePath, ok, status, statusText, body, json,
}) {
  if (!shouldLogGLaaSRequests()) return;
  const label = ok ? '[GLaaS addAssets] success' : '[GLaaS addAssets] error';
  const detail = {
    daBasePath,
    status,
    statusText,
    ...(json && { json }),
    ...(!json && body && { body }),
  };
  if (ok) {
    // eslint-disable-next-line no-console -- intentional upload debug
    console.info(label, detail);
  } else {
    // eslint-disable-next-line no-console -- intentional upload debug
    console.error(label, detail);
  }
}

export async function addAssets({
  origin,
  clientid,
  token,
  task,
  items,
}, actions) {
  const { name, workflow, targetLocales } = task;
  const { sendMessage, updateLangTask } = actions;

  task.sent ??= 0;
  task.error ??= 0;

  const batches = makeBatches(items, 5);

  for (const [index, batch] of batches.entries()) {
    sendMessage({ text: `Uploading batch ${index + 1} of ${batches.length}.` });

    const results = await Promise.all(batch.map(async (item) => {
      const body = new FormData();

      const file = new Blob([item.content], { type: 'text/html' });
      const glaasFilename = getGlaasFilename(item.daBasePath);
      const fileDetails = {
        assetName: glaasFilename,
        assetType: 'SOURCE',
        targetLocales,
      };

      // GLaaS v1.2
      body.append('file', file, glaasFilename);

      const assetMetadata = {
        assetName: glaasFilename,
        metadata: { 'source-preview-url': glaasSourcePreviewUrl(item.aemHref) },
        // GLaaS backward compatibility issue for WS (En-GB) - hence adding here as well.
        assetType: 'SOURCE',
        targetLocales,
        ...(item.translationMetadata && { langMetadata: item.translationMetadata }),
        ...(item.languageContext && { languageContext: item.languageContext }),
      };
      body.append('_asset_metadata_', new Blob(
        [JSON.stringify(assetMetadata)],
        { type: 'application/json' },
      ));

      const opts = getOpts(clientid, token, body, null, 'POST');
      // Add fileDetails parameter for GLaaS v1.2
      const url = `${origin}/api/l10n/v1.2/tasks/${workflow}/${name}/assets?targetLanguages=${targetLocales.join(',')}&fileDetails=${encodeURIComponent(JSON.stringify(fileDetails))}`;
      logGlaasAddAssetsRequest({
        url,
        workflow,
        taskName: name,
        targetLocales,
        fileDetails,
        assetMetadata,
        daBasePath: item.daBasePath,
      });

      try {
        const resp = await fetch(url, opts);
        const response = await readGlaasResponse(resp);
        logGlaasAddAssetsResponse({
          daBasePath: item.daBasePath,
          ok: resp.ok,
          ...response,
        });
        if (!resp.ok) {
          return {
            error: 'There was an error uploading',
            status: response.status,
            glaasBody: response.body,
          };
        }
        return { status: response.status };
      } catch (error) {
        if (shouldLogGLaaSRequests()) {
          // eslint-disable-next-line no-console -- dev GLaaS handoff (glaas.log)
          console.error('[GLaaS addAssets] error', {
            daBasePath: item.daBasePath,
            message: error?.message ?? String(error),
          });
        }
        return { error: 'There was an error uploading' };
      }
    }));
    task.sent += results.filter((result) => (result.status)).length;
    task.error += results.filter((result) => (result.error)).length;
    updateLangTask(task, task.langs);
  }
  if (shouldLogGLaaSRequests()) {
    // eslint-disable-next-line no-console -- dev GLaaS handoff (glaas.log)
    console.info('[GLaaS addAssets] batch complete', {
      taskName: name,
      workflow,
      targetLocales,
      sent: task.sent,
      error: task.error,
      status: task.error === 0 ? 'uploaded' : 'uploading-with-errors',
    });
  }
  if (task.error === 0) task.status = 'uploaded';
}

export async function updateStatus(service, token, task, newStatus = 'CREATED') {
  await throttle(1000);

  const { origin, clientid } = service;
  const { name, workflow, targetLocales } = task;
  const body = new FormData();
  body.append('newStatus', newStatus);

  const opts = getOpts(clientid, token, body, null, 'POST');

  const results = await Promise.all(targetLocales.map(async (code) => {
    const url = `${origin}/api/l10n/v1.2/tasks/${workflow}/${name}/${code}/updateStatus`;
    try {
      const resp = await fetch(url, opts);
      if (!resp.ok) throw new Error(resp.status);
      return { success: true };
    } catch {
      return { error: 'unknown' };
    }
  }));

  const ok = !results.some((result) => result.error);
  if (ok) task.status = 'created';

  return { task, ok, results };
}

export async function downloadAsset(service, token, task, path) {
  const { origin, clientid } = service;
  const { name, workflow, code } = task;
  const opts = getOpts(clientid, token, null, null, 'GET');
  const url = `${origin}/api/l10n/v1.2/tasks/${workflow}/${name}/assets/${code}${path}`;
  try {
    const resp = await fetch(url, opts);
    return resp.text();
  } catch {
    return { error: 'Error downloading asset.' };
  }
}

export async function prepareTargetPreview(task, urls, service) {
  if (!service.preview) return;

  const { name, workflow, workflowName, targetLocales } = task;
  const workflowSplit = workflow.split('/');
  if (workflowSplit.length === 2) {
    const data = {
      product: workflowSplit[0],
      project: workflowSplit[1],
      workflowName,
      taskName: name,
      useTaskVersion: 'v2',
      targetLocales,
      urls: urls.map((a) => a.aemHref),
    };
    await fetch(`https://${service.preview}/api/v1/web/daloc/init-target`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OW-EXTRA-LOGGING': 'on' },
      body: JSON.stringify(data),
    });
  }
}
