import { Queue } from '../../../../public/utils/tree.js';
import {
  checkSession, createTask, addAssets, updateStatus, getTask, downloadAsset,
  prepareTargetPreview, getGlaasFilename,
} from './api.js';
import { getGlaasToken, connectToGlaas } from './auth.js';
import { addDnt, removeDnt } from './dnt.js';
import { groupUrlsByWorkflow } from './locPageRules.js';
import { fetchConfig } from '../../utils/utils.js';

function determineStatus(translation) {
  if (translation.error > 0) return 'failed';
  // Respect existing final statuses
  const finalStatuses = ['complete', 'cancelled', 'error'];
  if (finalStatuses.includes(translation.status)) {
    return translation.status;
  }
  if (translation.workflowTasks) {
    const workflowTasks = Object.values(translation.workflowTasks);
    const taskStatuses = workflowTasks.map((task) => task.status.status);
    const statuses = ['not started', 'draft', 'uploading', 'failed', 'uploaded', 'created', 'translated', 'complete', 'cancelled'];
    for (const stage of statuses) {
      if (taskStatuses.every((status) => status === stage)) {
        return stage;
      } if (taskStatuses.some((status) => status === stage)) {
        return stage;
      }
    }
  }
  return 'not started';
}

function normalizeLegacyStructure(lang, urls = []) {
  if (lang.translation && lang.translation.name && !lang.translation.workflowTasks) {
    lang.translation.workflowTasks = {
      [lang.translation.name]: {
        workflow: lang.workflow,
        name: lang.translation.name,
        urls: urls.map((url) => url.suppliedPath),
        status: {
          sent: lang.translation.sent || 0,
          error: lang.translation.error || 0,
          translated: lang.translation.translated || 0,
          status: lang.translation.status || 'not started',
        },
      },
    };
    delete lang.translation.name;
  }
}

function normalizeAllLanguages(langs, urls = []) {
  langs.forEach((lang) => normalizeLegacyStructure(lang, urls));
}

function langs2Tasks(langs) {
  const taskGroups = {};

  langs.forEach((lang) => {
    if (lang.translation?.workflowTasks) {
      Object.entries(lang.translation.workflowTasks).forEach(([name, workflowTask]) => {
        // Create composite key to handle same task name with different workflows
        const compositeKey = `${workflowTask.workflow}::${name}`;
        if (!taskGroups[compositeKey]) {
          taskGroups[compositeKey] = {
            workflow: workflowTask.workflow,
            name,
            langs: [],
            urlPaths: workflowTask.urls || [],
          };
        }
        taskGroups[compositeKey].langs.push(lang);
      });
    }
  });

  return taskGroups;
}

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

function simpleHash(data) {
  // Simple hash function for browser compatibility
  let hash = 0;
  for (let i = 0; i < data.length; i += 1) {
    const char = data.charCodeAt(i);
    hash = ((hash * 32) - hash + char) % 0x100000000;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function workflowGroups2tasks(title, workflowGroups, langs, timestamp) {
  const tasks = {};

  Object.entries(workflowGroups).forEach(([workflowKey, groups]) => {
    const lastSlashIndex = workflowKey.lastIndexOf('/');
    const workflow = workflowKey.substring(0, lastSlashIndex);
    const workflowName = workflowKey.substring(lastSlashIndex + 1);

    // Create a task for each group within the workflow
    groups.forEach((group, index) => {
      // Find the language objects that match this group's languages
      const groupLangs = langs.filter((lang) => group.languages.includes(lang.code));

      if (groupLangs.length > 0) {
        const taskName = `${title.toLowerCase()}-${simpleHash(workflowKey)}-${index}-${timestamp}`;
        tasks[taskName] = {
          status: groupLangs[0]?.translation?.status || 'not started',
          name: taskName,
          timestamp,
          workflowName,
          workflow,
          langs: groupLangs,
          urlPaths: group.urlPaths,
        };
      }
    });
  });

  return tasks;
}

function sumTaskStatus(workflowTasks, statusKey) {
  return workflowTasks.reduce((sum, task) => sum + (task.status[statusKey] || 0), 0);
}

function aggregateWorkflowStatus(lang) {
  const workflowTasks = Object.values(lang.translation.workflowTasks);

  lang.translation.sent = sumTaskStatus(workflowTasks, 'sent');
  lang.translation.error = sumTaskStatus(workflowTasks, 'error');
  lang.translation.translated = sumTaskStatus(workflowTasks, 'translated');
  lang.translation.status = determineStatus(lang.translation);
}

function updateLangTask(task, langs) {
  langs.forEach((lang) => {
    // Workflow task structure is now pre-populated, just update the status
    const workflowTask = lang.translation.workflowTasks[task.name];
    workflowTask.status.sent = task.sent || 0;
    workflowTask.status.error = task.error || 0;
    workflowTask.status.translated = task.translated || 0;
    workflowTask.status.status = task.status || 'not started';
    // Aggregate the overall status
    aggregateWorkflowStatus(lang);
  });
}

function addTaskAssets(service, task, items, actions) {
  const conf = { ...service, token, task, items };
  const assetActions = { ...actions, updateLangTask };
  return addAssets(conf, assetActions);
}

async function createNewTask(service, task) {
  const { origin, clientid } = service;
  const result = await createTask({ origin, clientid, token, task, service });
  return { ...result, ...task, status: 'draft' };
}

async function sendTask(service, suppliedTask, urls, actions) {
  const { sendMessage, saveState } = actions;

  const targetLocales = suppliedTask.langs.map((lang) => lang.code);
  let task = {
    ...suppliedTask,
    targetLocales,
  };

  const localesString = targetLocales.join(', ');

  // Filter content from original urls array using task.urlPaths
  const taskUrls = task.urlPaths
    ? urls.filter((url) => task.urlPaths.includes(url.suppliedPath))
    : urls;

  // Only create a task if it has not been started
  if (task.status === 'not started') {
    sendMessage({ text: `Creating task for: ${localesString}.` });
    task = await createNewTask(service, task);
    if (task.error) {
      const text = `Error creating task for: ${localesString}.`;
      sendMessage({ text, type: 'error' });
      return;
    }
    updateLangTask(task, task.langs);
    await saveState();
  }

  // Only add assets if task is not uploaded
  if (task.status === 'draft' || task.status === 'uploading') {
    sendMessage({ text: `Uploading items for: ${localesString}.` });
    task.status = 'uploading';
    updateLangTask(task, task.langs);
    await addTaskAssets(service, task, taskUrls, actions);
    await prepareTargetPreview(task, taskUrls, service);
    updateLangTask(task, task.langs);
    await saveState();
  }

  // Only wrap up task if everything is uploaded
  if (task.status === 'uploaded') {
    sendMessage({ text: `Updating task for: ${localesString}.` });
    await updateStatus(service, token, task);
    updateLangTask(task, task.langs);
    await saveState();
    sendMessage();
  }
}

// Business unit determination logic for GLaaS Transcreation Style Guide
const getBusinessUnit = (siteName) => {
  if (siteName && siteName.includes('bacom')) {
    return 'Digital Experience';
  }
  return 'Digital Media';
};

function initializeLanguageWorkflowTasks(tasks) {
  Object.values(tasks).forEach((task) => {
    task.langs.forEach((lang) => {
      if (!lang.translation) {
        lang.translation = {};
      }
      if (!lang.translation.workflowTasks) {
        lang.translation.workflowTasks = {};
      }

      lang.translation.workflowTasks[task.name] = {
        workflow: task.workflow,
        name: task.name,
        urls: task.urlPaths || [],
        status: {
          sent: 0,
          error: 0,
          translated: 0,
          status: 'not started',
        },
      };
    });
  });
  return tasks;
}

async function getTasks(org, site, title, langs, urls, timestamp) {
  const config = await fetchConfig(org, site);
  // Extract just the URL paths for grouping logic
  const urlPaths = urls.map((url) => (typeof url === 'object' ? url.suppliedPath : url));
  // groupUrlsByWorkflow works with simple path strings
  const workflowGroups = groupUrlsByWorkflow(urlPaths, langs, config);
  const tasks = workflowGroups2tasks(title, workflowGroups, langs, timestamp);
  // Pre-populate workflow task structure for each language
  initializeLanguageWorkflowTasks(tasks);
  // Add business unit to each task
  const businessUnit = getBusinessUnit(site);
  Object.values(tasks).forEach((task) => {
    task.businessUnit = businessUnit;
  });

  return tasks;
}

export async function sendAllLanguages({
  org, site, title, service, langs, urls, actions,
}) {
  const timestamp = Date.now();
  const tasks = await getTasks(org, site, title, langs, urls, timestamp);

  for (const key of Object.keys(tasks)) {
    await sendTask(service, tasks[key], urls, actions);
  }
}

export async function getStatusAll({ service, langs, urls, actions }) {
  const baseConf = { ...service, token };
  const { sendMessage, saveState } = actions;

  normalizeAllLanguages(langs, urls);
  const tasks = langs2Tasks(langs);

  // Filter out complete and canceled
  const incompleteTasks = Object.values(tasks).filter((task) => {
    const notAllCancelledOrComplete = task.langs.some((lang) => {
      const langStatus = lang?.translation?.status;
      return langStatus !== 'complete' || langStatus !== 'cancelled';
    });
    return notAllCancelledOrComplete;
  });

  if (incompleteTasks.length === 0) {
    sendMessage({ text: 'All languages complete or canceled.' });
    return;
  }

  for (const task of incompleteTasks) {
    const targetLocales = task.langs.map((lang) => lang.code);
    const localesString = targetLocales.join(', ');
    sendMessage({ text: `Getting status for ${localesString}` });

    const taskConfig = {
      ...baseConf,
      name: task.name,
      workflow: task.workflow,
      targetLocales,
    };

    let subtasks = await getTask(taskConfig);
    // If something went wrong, create the task again.
    if (subtasks.status === 404) {
      // If something went wrong, create the task again.
      const taskUrls = task.urlPaths
        ? urls.filter((url) => task.urlPaths.includes(url.suppliedPath))
        : urls;

      const tempTask = {
        name: task.name,
        workflow: task.workflow,
        langs: task.langs,
        urlPaths: task.urlPaths,
      };

      await sendTask(service, tempTask, taskUrls, actions);
      subtasks = await getTask(taskConfig);
    }

    for (const subtask of subtasks.json) {
      const subtaskLang = langs.find((lang) => lang.code === subtask.targetLocale);
      if (subtaskLang?.translation?.workflowTasks?.[task.name]) {
        const workflowStatus = subtaskLang.translation.workflowTasks[task.name].status;

        if (subtask.status === 'FAILED') {
          workflowStatus.status = 'failed';
        } else if (subtask.status === 'CANCEL_REQUESTED' || subtask.status === 'CANCELLED') {
          workflowStatus.status = 'cancelled';
        } else {
          const translated = subtask.assets.filter((asset) => asset.status === 'COMPLETED').length;
          workflowStatus.translated = translated;
          if (workflowStatus.sent !== 0 && workflowStatus.status !== 'complete') {
            const isTranslated = translated === workflowStatus.sent;
            if (isTranslated) workflowStatus.status = 'translated';
          }
        }
      }
    }
    sendMessage();
  }
  for (const lang of langs) {
    if (lang.translation?.workflowTasks) {
      aggregateWorkflowStatus(lang);
      await saveState();
    }
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
  normalizeLegacyStructure(lang, urls);

  const { translation, code } = lang;

  // Create a map of URL path to task for efficient lookup
  const urlToTaskMap = new Map();
  Object.values(translation.workflowTasks).forEach((workflowTask) => {
    workflowTask.urls.forEach((urlPath) => {
      urlToTaskMap.set(urlPath, {
        name: workflowTask.name,
        workflow: workflowTask.workflow,
      });
    });
  });

  // Verify all URLs have matching tasks
  const missingUrls = urls.filter((url) => !urlToTaskMap.has(url.suppliedPath));
  if (missingUrls.length > 0) {
    throw new Error(`No matching tasks found for URLs: ${missingUrls.map((u) => u.suppliedPath).join(', ')}`);
  }

  const downloadCallback = async (url) => {
    const task = urlToTaskMap.get(url.suppliedPath);
    const text = await downloadAsset(
      service,
      token,
      { ...task, code },
      getGlaasFilename(url.daBasePath),
    );

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
  normalizeLegacyStructure(lang);

  if (!canCancelLang({ lang })) {
    sendMessage({ text: `Skipping ${lang.name}. No translation information.` });
    return null;
  }

  const { code } = lang;
  // As a service provider, you need to say what will be canceled
  if (lang.translation?.workflowTasks) {
    const cancelPromises = Object.values(lang.translation.workflowTasks)
      .map(async (workflowTask) => {
        const taskName = workflowTask.name;
        const taskWorkflow = workflowTask.workflow;
        sendMessage({ text: `Canceling task ${taskName} for ${lang.name}.` });
        return updateStatus(service, token, { name: taskName, workflow: taskWorkflow, targetLocales: [code] }, 'CANCELLED');
      });

    return Promise.all(cancelPromises);
  }
  sendMessage({ text: `No tasks found to cancel for ${lang.name}.` });
  return null;
}
