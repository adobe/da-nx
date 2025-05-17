import {
  checkSession, createTask, addAssets, updateStatus, getTask, downloadAsset, prepareTargetPreview,
} from './api.js';
import { getGlaasToken, connectToGlaas } from './auth.js';

let token;

export async function isConnected(service) {
  token = await getGlaasToken(service);
  if (token) {
    const sessionConf = { ...service, token };
    const status = await checkSession(sessionConf);
    if (status === 200) return true;
  }
  return false;
}

export async function connect(service) {
  localStorage.setItem('currentProject', window.location.hash);
  connectToGlaas(service.origin, service.clientid);
}

function langs2tasks(title, langs, timestamp) {
  return langs.reduce((acc, lang) => {
    if (lang.workflowName === '') return acc;
    if (acc[lang.workflowName]) {
      acc[lang.workflowName].langs.push(lang);
    } else {
      acc[lang.workflowName] = {
        status: lang.translation?.status || 'not started',
        name: lang.translation?.name || `${title.toLowerCase()}-${timestamp}`,
        timestamp,
        workflowName: lang.workflowName,
        workflow: lang.workflow,
        langs: [lang],
      };
    }
    return acc;
  }, {});
}

function updateLangTask(task, langs) {
  langs.forEach((lang) => {
    if (lang.workflow === task.workflow) {
      const { sent, error, translated } = lang;

      lang.translation = {
        sent: sent || task.sent,
        error: error || task.error,
        translated: translated || task.translated,
        name: task.name,
        status: task.status,
      };
    }
  });
}

function addTaskAssets(service, langs, task, items, actions) {
  actions.setStatus(`Uploading items to GLaaS for project: ${task.name}.`);
  const conf = { ...service, token, langs, task, items };
  const assetActions = { ...actions, updateLangTask };
  return addAssets(conf, assetActions);
}

async function createNewTask(service, task, setStatus) {
  setStatus(`Creating task ${task.name} using ${task.workflowName}.`);

  const { origin, clientid } = service;
  const result = await createTask({ origin, clientid, token, task, service });
  return { ...result, status: 'draft' };
}

async function sendTask(service, suppliedTask, langs, urls, actions) {
  const { setStatus, saveState } = actions;
  let task = suppliedTask;

  task.targetLocales ??= task.langs.map((lang) => lang.code);

  // Only create a task if it has not been started
  if (task.status === 'ready') {
    task = await createNewTask(service, task, setStatus);
    if (task.error) {
      setStatus(`${task.error} - ${task.status}`);
      return;
    }
    updateLangTask(task, langs);
    await saveState();
  }

  // Only add assets if task is not uploaded
  if (task.status === 'draft' || task.status === 'uploading') {
    task.status = 'uploading';
    updateLangTask(task, langs);
    await addTaskAssets(service, langs, task, urls, actions);
    await prepareTargetPreview(task, urls, service);
    updateLangTask(task, langs);
    await saveState();
  }

  // Only wrap up task if everything is uploaded
  if (task.status === 'uploaded') {
    await updateStatus(service, token, task);
    updateLangTask(task, langs);
    await saveState();
  }
}

export async function sendAllLanguages({ title, service, langs, urls, actions }) {
  const timestamp = Date.now();

  const tasks = langs2tasks(title, langs, timestamp);

  for (const key of Object.keys(tasks)) {
    await sendTask(service, tasks[key], langs, urls, actions);
  }
}

export async function getStatusAll(title, service, langs, urls, actions) {
  const { setStatus, saveState } = actions;

  const tasks = langs2tasks(title, langs);

  const baseConf = { ...service, token };

  for (const key of Object.keys(tasks)) {
    const task = tasks[key];

    setStatus(`Getting status for task ${task.name} (${task.langs.length} languages)`);
    let subtasks = await getTask({ ...baseConf, ...task });
    // If something went wrong, create the task again.
    if (subtasks.status === 404) {
      await sendTask(service, task, langs, urls, actions);
      subtasks = await getTask({ ...baseConf, ...task });
    }

    for (const subtask of subtasks.json) {
      const translated = subtask.assets.filter((asset) => asset.status === 'COMPLETED').length;
      const subtaskLang = langs.find((lang) => lang.code === subtask.targetLocale);
      subtaskLang.translation.translated = translated;
      setStatus();
      await saveState();

      // Determine if we have more to upload
      // const uploadedUrls = subtask.assets?.map((asset) => asset.name) || [];
      // if (uploadedUrls.length !== urls.length) {
      //   const remainingUrls = urls.reduce((acc, url) => {
      //     const found = uploadedUrls.find((upload) => upload === url.basePath);
      //     if (!found) acc.push(url);
      //     return acc;
      //   }, []);
      //   await sendTask(service, subtask, langs, remainingUrls, actions);
      // }

      // const translated = task.assets.filter((asset) => asset.status === 'COMPLETED').length;
      // if (task.assets.length === translated) daTask.status = 'translated';
      // console.log(daTask);
      // daTask.translated = translated;

      // updateLangTask(daTask, langs);
    }
  }
}

export async function getItems(service, lang, urls) {
  const { translation, workflow, code } = lang;
  const task = { name: translation.name, workflow, code };

  return Promise.all(urls.map(async (url) => {
    const blob = await downloadAsset(service, token, task, url.basePath);
    return { ...url, blob };
  }));
}
