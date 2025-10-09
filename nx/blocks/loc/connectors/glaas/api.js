import makeBatches from '../../../../public/utils/batch.js';

async function throttle(ms = 500) {
  return new Promise((resolve) => { setTimeout(() => { resolve(); }, ms); });
}

function getOpts(clientid, token, body, contentType, method = 'GET') {
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

export async function createTask({ origin, clientid, token, task, service }) {
  const { name, workflowName, workflow, targetLocales, businessUnit } = task;
  const callbackConfig = [];
  if (service.preview) {
    const hookUrl = `https://${service.preview}/api/v1/web/daloc/glaas-hook`;
    callbackConfig.push({ key: 'taskCallbackURL', value: hookUrl });
    callbackConfig.push({ key: 'assetCallbackURL', value: hookUrl });
  }

  const body = {
    name,
    targetLocales,
    workflowName,
    contentSource: 'Adhoc',
    callbackConfig,
    config: [{
      key: 'businessUnit',
      value: businessUnit,
    }],
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

export async function getTask({ origin, clientid, token, workflow, name }) {
  const opts = getOpts(clientid, token);
  try {
    const resp = await fetch(`${origin}/api/l10n/v1.2/tasks/${workflow}/${name}`, opts);
    const json = await resp.json();
    return { status: resp.status, json };
  } catch {
    return { error: 'Error getting task.' };
  }
}

// Helper function to ensure GLaaS compatibility with json extensions are converted to html
export const getGlaasFilename = (daBasePath) => (daBasePath.endsWith('.html') ? daBasePath : `${daBasePath}.html`);

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
        metadata: { 'source-preview-url': item.aemHref },
      };

      // GLaaS v1.2
      body.append('file', file, glaasFilename);

      const opts = getOpts(clientid, token, body, null, 'POST');
      // Add fileDetails parameter for GLaaS v1.2
      const url = `${origin}/api/l10n/v1.2/tasks/${workflow}/${name}/assets?targetLanguages=${targetLocales.join(',')}&fileDetails=${encodeURIComponent(JSON.stringify(fileDetails))}`;

      try {
        const resp = await fetch(url, opts);
        if (!resp.ok) throw new Error(resp.status);
        return { status: resp.status };
      } catch {
        return { error: 'There was an error uploading' };
      }
    }));
    task.sent += results.filter((result) => (result.status)).length;
    task.error += results.filter((result) => (result.error)).length;
    updateLangTask(task, task.langs);
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

  if (!results.some((result) => result.error)) task.status = 'created';

  return task;
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
