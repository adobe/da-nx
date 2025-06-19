import { Queue } from '../../../../public/utils/tree.js';
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
    const workflow = `${lang.workflow}/${lang.workflowName}`;
    if (workflow === '/') return acc;
    if (acc[workflow]) {
      acc[workflow].langs.push(lang);
    } else {
      acc[workflow] = {
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
  const baseConf = { ...service, token };

  const { sendMessage, saveState } = actions;

  const tasks = langs2tasks(title, langs);

  // Filter out complete and canceled
  const incompleteTasks = Object.keys(tasks).reduce((acc, key) => {
    const notAllCancelledOrComplete = tasks[key].langs.some((lang) => {
      const langStatus = lang?.translation?.status;
      return langStatus !== 'complete' || langStatus !== 'cancelled';
    });
    if (notAllCancelledOrComplete) acc.push(tasks[key]);
    return acc;
  }, []);

  if (incompleteTasks.length === 0) {
    sendMessage({ text: 'All languages complete or canceled.' });
    return;
  }

  for (const task of incompleteTasks) {
    const targetLocales = task.langs.map((lang) => lang.code);
    const localesString = targetLocales.join(', ');

    sendMessage({ text: `Getting status for ${localesString}` });

    let subtasks = await getTask({ ...baseConf, ...task });
    // If something went wrong, create the task again.
    if (subtasks.status === 404) {
      await sendTask(service, task, langs, urls, actions);
      subtasks = await getTask({ ...baseConf, ...task });
    }

    for (const subtask of subtasks.json) {
      const subtaskLang = langs.find((lang) => lang.code === subtask.targetLocale);

      if (subtask.status === 'FAILED') {
        subtaskLang.translation.status = 'failed';
      } else if (subtask.status === 'CANCEL_REQUESTED' || subtask.status === 'CANCELLED') {
        subtaskLang.translation.status = 'cancelled';
      } else {
        const translated = subtask.assets.filter((asset) => asset.status === 'COMPLETED').length;
        subtaskLang.translation.translated = translated;
        if (subtaskLang.translation.sent !== 0 && subtaskLang.translation.status !== 'complete') {
          const isTranslated = translated === subtaskLang.translation.sent;
          if (isTranslated) subtaskLang.translation.status = 'translated';
        }
      }
      await saveState();
    }
    sendMessage();
  }
}

export async function saveItems({
  org,
  site,
  service,
  lang,
  urls,
  saveToDa,
}) {
  const { translation, workflow, code } = lang;
  const task = { name: translation.name, workflow, code };

  const downloadCallback = async (url) => {
    const text = await downloadAsset(service, token, task, url.daBasePath);

    // Use the path to determine if this should be treated as a JSON file.
    const fileType = url.daBasePath.includes('.json') ? 'json' : undefined;

    url.sourceContent = await removeDnt(text, org, site, { fileType });

    await saveToDa(url);
  };

  const queue = new Queue(downloadCallback, 5);

  return new Promise((resolve) => {
    const throttle = setInterval(() => {
      const nextUrl = urls.find((url) => !url.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else {
        const finished = urls.every((url) => url.status);
        if (finished) {
          clearInterval(throttle);
          resolve(urls);
        }
      }
    }, 250);
  });
}

async function canCancelLang({ lang }) {
  // Only allow cancel if there is a translation object made
  return !!lang.translation;
}

export async function cancelTranslation({ service, lang, sendMessage }) {
  // As a service provider, you need to say what will be canceled
  const { translation, workflow, code } = lang;
  if (!canCancelLang({ lang })) {
    sendMessage({ text: `Skipping ${lang.name}. No translation information.` });
    return null;
  }
  sendMessage({ text: `Canceling ${lang.name}.` });
  return updateStatus(service, token, { name: translation.name, workflow, targetLocales: [code] }, 'CANCELLED');
}
