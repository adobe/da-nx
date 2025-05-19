import {
  checkSession, createTask, addAssets, updateStatus, getTask, downloadAsset, prepareTargetPreview,
} from './api.js';
import { getGlaasToken, connectToGlaas } from './auth.js';
import { addDnt, removeDnt } from './dnt.js';

let token;

export const dnt = { addDnt };

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
  const conf = { ...service, token, langs, task, items };
  const assetActions = { ...actions, updateLangTask };
  return addAssets(conf, assetActions);
}

async function createNewTask(service, task) {
  const { origin, clientid } = service;
  const result = await createTask({ origin, clientid, token, task, service });
  return { ...result, status: 'draft' };
}

async function sendTask(service, suppliedTask, langs, urls, actions) {
  const { sendMessage, saveState } = actions;

  const targetLocales = suppliedTask.langs.map((lang) => lang.code);
  let task = { ...suppliedTask, targetLocales };

  const localesString = targetLocales.join(', ');

  // Only create a task if it has not been started
  if (task.status === 'not started') {
    sendMessage({ text: `Creating task for: ${localesString}.` });

    task = await createNewTask(service, task);
    if (task.error) {
      const text = `Error creating task for: ${localesString}.`;
      sendMessage({ text, type: 'error' });
      return;
    }
    updateLangTask(task, langs);
    await saveState();
  }

  // Only add assets if task is not uploaded
  if (task.status === 'draft' || task.status === 'uploading') {
    sendMessage({ text: `Uploading items for: ${localesString}.` });
    task.status = 'uploading';
    updateLangTask(task, langs);
    await addTaskAssets(service, langs, task, urls, actions);
    await prepareTargetPreview(task, urls, service);
    updateLangTask(task, langs);
    await saveState();
  }

  // Only wrap up task if everything is uploaded
  if (task.status === 'uploaded') {
    sendMessage({ text: `Updating task for: ${localesString}.` });
    await updateStatus(service, token, task);
    updateLangTask(task, langs);
    await saveState();
    sendMessage();
  }
}

export async function sendAllLanguages({ title, service, langs, urls, actions }) {
  const timestamp = Date.now();

  const tasks = langs2tasks(title, langs, timestamp);

  for (const key of Object.keys(tasks)) {
    await sendTask(service, tasks[key], langs, urls, actions);
  }
}

export async function getStatusAll({ title, service, langs, urls, actions }) {
  const { sendMessage, saveState } = actions;

  const tasks = langs2tasks(title, langs);

  const baseConf = { ...service, token };

  for (const key of Object.keys(tasks)) {
    const task = tasks[key];

    const targetLocales = task.langs.map((lang) => lang.code);
    const localesString = targetLocales.join(', ');

    sendMessage({ text: `Getting task status for ${localesString}` });

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
      if (subtaskLang.translation.sent !== 0 && subtaskLang.translation.status !== 'complete') {
        const isTranslated = translated === subtaskLang.translation.sent;
        if (isTranslated) subtaskLang.translation.status = 'translated';
      }
      await saveState();
    }
    sendMessage();
  }
}

export async function getItems({ org, site, service, lang, urls }) {
  const { translation, workflow, code } = lang;
  const task = { name: translation.name, workflow, code };

  return Promise.all(urls.map(async (url) => {
    const text = await downloadAsset(service, token, task, url.daBasePath);

    // Use the path to determine if this should be treated
    // as a JSON file since GLaaS will always return an HTML file.
    const fileType = url.daBasePath.includes('.json') ? 'json' : undefined;

    const content = await removeDnt(text, org, site, { fileType });
    return { ...url, content };
  }));
}

export function canCancel() {
  return true;
}

export async function cancelLang(service, lang) {
  const { translation, workflow, code } = lang;
  if (!translation || !translation.name || !workflow || !code) {
    return { error: 'Error cancelling task.', status: 'error' };
  }
  return updateStatus(service, token, { name: translation.name, workflow, targetLocales: [code] }, 'CANCELLED');
}
