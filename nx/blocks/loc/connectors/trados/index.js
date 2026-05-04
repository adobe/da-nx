import { Queue } from '../../../../public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import authReady, { getAccessToken } from './auth.js';
import { corsFetch } from './utils.js';

export const dnt = { addDnt };

export function isConnected(service) {
  return authReady(service);
}

export function connect(service) {
  return authReady(service);
}

// --- Helpers ---

/**
 * Extracts custom fields from options that start with 'translation.service.custom'.
 * Returns an object with the field names as keys and their values.
 * @param {Object} options - The options object containing translation settings
 * @returns {Object} Object containing custom field key-value pairs
 */
function extractCustomFields(options) {
  const customFields = {};
  const prefix = 'translation.service.custom';

  Object.entries(options).forEach(([key, value]) => {
    if (key.startsWith(prefix) && value !== undefined && value !== null && value !== '') {
      // Extract the field name from the key
      // e.g., 'translation.service.custom.option.Template' -> 'Template'
      // e.g., 'translation.service.custom.textarea.Notes' -> 'Notes'
      const parts = key.split('.');
      if (parts.length >= 4) {
        const fieldName = parts.slice(4).join('.');
        customFields[fieldName] = value;
      }
    }
  });

  return customFields;
}

async function getOpts(service, method = 'GET', body = null, contentType = 'application/json') {
  const { tenantId } = service;
  const token = await getAccessToken(service);
  if (!token) throw new Error('Trados authentication failed');

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-LC-Tenant': tenantId,
    },
  };

  if (body) opts.body = body;

  // Don't set Content-Type for FormData - browser sets multipart boundary automatically
  if (contentType && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = contentType;
  }

  return opts;
}

function ensureExtension(path) {
  if (path.endsWith('.html')) return path;

  // Add .html to `file-name.json` so when we get
  // the doc back, we know it was originally json
  return `${path}.html`;
}

// --- Project Operations ---

/**
 * Fetches custom field definitions from Trados and builds a lookup map.
 * @param {Object} service - The service configuration
 * @param {Function} sendMessage - Optional callback for sending debug messages
 * @returns {Promise<Map>} Map of field names to their definitions (key, type, picklist, etc.)
 */
async function getCustomFieldDefinitions(service) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'GET');
  const resp = await corsFetch(
    `${apiEndpoint}/custom-field-definitions?fields=id,name,key,type,description,defaultValue,isMandatory`,
    opts,
  );

  if (!resp.ok) return new Map();

  const json = await resp.json();
  const definitions = json.items || [];

  // Build a lookup map: name -> definition
  return new Map(definitions.map((def) => [def.name, def]));
}

async function createProject(options, service, title, langs, sendMessage) {
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 14);
  const dueBy = options['project.due'] || defaultDate.toISOString();
  const sourceLanguage = options['source.language']?.code || 'en-US';

  const { apiEndpoint } = service;

  const location = langs[0]['trados location'];

  // Extract all custom fields systematically
  const customFields = extractCustomFields(options);

  // Handle Template with fallback to lang config
  const templateId = customFields.Template || langs[0]['trados project template'];

  // Handle Notes for description with fallback
  const description = customFields.Notes || `DA translation project: ${title}`;

  const languageDirections = langs.map((lang) => ({
    sourceLanguage: { languageCode: sourceLanguage },
    targetLanguage: { languageCode: lang.code },
  }));

  // Build base project body
  const projectBody = {
    name: `${title} - ${Date.now()}`,
    description,
    dueBy,
    projectTemplate: {
      id: templateId,
    },
    languageDirections,
    IsSpecificDueDate: false,
    location,
  };

  // Fetch custom field definitions to validate against
  const fieldDefinitions = await getCustomFieldDefinitions(service);

  // Add any additional custom fields (excluding Template and Notes which we already handled)
  // Custom fields must match existing definitions and use the definition's key
  const customFieldsArray = Object.entries(customFields).reduce((acc, [name, value]) => {
    if (name !== 'Template' && name !== 'Notes') {
      const definition = fieldDefinitions.get(name);
      if (definition) {
        // Use the definition's key (required by Trados API)
        // For PICKLIST type, value should be a valid picklist option ID
        // For STRING/DATE types, value is the actual string/date value
        acc.push({ key: definition.key, value });
      } else if (sendMessage) {
        // Warn about custom fields that don't match Trados definitions
        sendMessage({
          text: `Custom field "${name}" not found in Trados definitions. It will be ignored.`,
          type: 'warning',
        });
      }
    }
    return acc;
  }, []);

  if (customFieldsArray.length > 0) {
    projectBody.customFields = customFieldsArray;
  }

  const body = JSON.stringify(projectBody);

  const opts = await getOpts(service, 'POST', body);
  const resp = await corsFetch(`${apiEndpoint}/projects`, opts);

  if (!resp.ok) {
    // Log error details
    const errorText = await resp.text();
    if (sendMessage) {
      sendMessage({
        text: `Project creation failed: ${errorText}`,
        type: 'error',
      });
    }
    return null;
  }

  const json = await resp.json();
  return json.id;
}

async function uploadFiles(options, service, projectId, urls) {
  const { apiEndpoint } = service;
  const sourceLanguage = options['source.language']?.code || 'en-US';

  let uploaded = 0;

  for (const url of urls) {
    const formData = new FormData();

    const fileName = ensureExtension(url.daBasePath);
    const [, ...path] = fileName.split('/');
    const name = path.pop();

    const fileProps = {
      name,
      language: sourceLanguage,
      type: 'native',
      role: 'translatable',
    };

    // Only add a path if there's something
    // left after removing the name.
    if (path.length) fileProps.path = path;

    const file = new Blob([url.content], { type: 'text/html' });

    formData.append('properties', JSON.stringify(fileProps));
    formData.append('file', file, fileName);

    const opts = await getOpts(service, 'POST', formData, null);
    const resp = await corsFetch(`${apiEndpoint}/projects/${projectId}/source-files`, opts);
    if (resp.ok) {
      const json = await resp.json();
      url.sourceFileId = json.id;
      uploaded += 1;
    }
  }

  return uploaded;
}

async function startProject(service, projectId) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'PUT');
  const resp = await corsFetch(`${apiEndpoint}/projects/${projectId}/start`, opts);
  return resp.ok || resp.status === 202;
}

// --- Exports ---

export async function sendAllLanguages({
  title, service, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const localesStr = langs.map((lang) => lang.code).join(', ');

  // 1. Create project
  sendMessage({ text: `Creating Trados project for: ${localesStr}.` });
  const projectId = await createProject(options, service, title, langs, sendMessage);
  if (!projectId) {
    sendMessage({ text: 'Error creating Trados project.', type: 'error' });
    return;
  }

  // Persist for status / download
  service.projectId = { value: projectId };

  // 2. Upload source files (adds sourceFileId to each url)
  sendMessage({ text: `Uploading ${urls.length} files to Trados.` });
  const uploaded = await uploadFiles(options, service, projectId, urls);

  // 3. Start project
  sendMessage({ text: 'Starting Trados project.' });
  const started = await startProject(service, projectId);

  // Update lang status
  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.projectId = projectId;
    lang.translation.sent = uploaded;
    lang.translation.status = started && uploaded === urls.length ? 'created' : 'error';
  });

  // Clean urls for persistence
  const cleanUrls = urls.map(({ basePath, suppliedPath, checked, sourceFileId }) => ({
    basePath,
    suppliedPath,
    checked,
    sourceFileId,
  }));

  await saveState({ options, urls: cleanUrls });
  sendMessage();
}

export function getSourceFileStatus(tasks) {
  // If source file tasks fail, all langs fail
  const sourceTasks = tasks.filter((task) => (
    ['scan', 'convert', 'copy-to-target'].includes(task.taskType?.key)
  ));
  if (!sourceTasks.length) return null;
  if (sourceTasks.some((t) => t.status === 'failed')) return 'error';
  if (sourceTasks.some((t) => t.status === 'canceled')) return 'canceled';
  if (sourceTasks.some((t) => t.status === 'skipped')) return 'skipped';
  return null;
}

export function getLangStatus(tasks, langCode, fileCount) {
  const langTasks = tasks.filter((task) => (
    task.input?.targetFile?.languageDirection?.targetLanguage?.languageCode === langCode
  ));

  // Translated file count for this lang
  const translated = langTasks.filter((t) => (
    t.taskType?.key === 'file-delivery' && t.status === 'completed'
  )).length;

  if (langTasks.some((t) => t.status === 'failed')) return { status: 'error', translated };
  if (langTasks.some((t) => t.status === 'skipped')) return { status: 'skipped', translated };
  if (langTasks.some((t) => t.status === 'canceled')) return { status: 'canceled', translated };
  if (translated === fileCount) return { status: 'translated', translated };

  return { status: 'in progress', translated };
}

export async function getStatusAll({ service, langs, urls, actions }) {
  const { sendMessage, saveState } = actions;
  const { apiEndpoint } = service;

  const projectId = langs[0]?.translation?.projectId;
  if (!projectId) return;

  const localesStr = langs.map((lang) => lang.code).join(', ');
  sendMessage({ text: `Getting status for ${localesStr}` });

  const opts = await getOpts(service);
  const resp = await corsFetch(
    `${apiEndpoint}/projects/${projectId}/tasks?fields=taskType,status,input.targetFile`,
    opts,
  );
  if (!resp.ok) return;

  const json = await resp.json();
  const tasks = json.items || [];

  const sourceError = getSourceFileStatus(tasks);

  langs.forEach((lang) => {
    lang.translation ??= {};
    if (sourceError) {
      lang.translation.status = sourceError;
    } else {
      const { status, translated } = getLangStatus(tasks, lang.code, urls.length);
      lang.translation.status = status;
      lang.translation.translated = translated;
    }
  });

  sendMessage();
  await saveState();
}

export async function saveItems({
  org,
  site,
  service,
  lang,
  urls,
  saveFn,
}) {
  const { apiEndpoint } = service;
  const projectId = lang?.translation?.projectId;
  if (!projectId) return urls;

  // Get target files for this project
  const opts = await getOpts(service);
  const resp = await corsFetch(
    `${apiEndpoint}/projects/${projectId}/target-files?fields=latestVersion,languageDirection.targetLanguage,sourceFile`,
    opts,
  );
  if (!resp.ok) return urls;

  const json = await resp.json();
  const targetFiles = json.items || [];

  // Build lookup: source file ID → target file (filtered by language)
  const sourceIdToTarget = new Map();
  for (const tf of targetFiles) {
    const targetLang = tf.languageDirection?.targetLanguage?.languageCode;
    const sourceId = tf.sourceFile?.id;
    if (sourceId && tf.latestVersion && targetLang === lang.code) {
      sourceIdToTarget.set(sourceId, tf);
    }
  }

  const downloadCallback = async (url) => {
    const tf = url.sourceFileId && sourceIdToTarget.get(url.sourceFileId);

    if (!tf) {
      url.status = 'error';
      return;
    }

    try {
      const dlUrl = `${apiEndpoint}/projects/${projectId}/target-files/${tf.id}/versions/${tf.latestVersion.id}/download`;
      const dlOpts = await getOpts(service);
      const dlResp = await corsFetch(dlUrl, dlOpts);
      if (!dlResp.ok) throw new Error(dlResp.status);

      const text = await dlResp.text();
      const ext = url.daBasePath.includes('.json') ? 'json' : 'html';
      url.sourceContent = await removeDnt({ org, site, html: text, ext });

      await saveFn(url);
    } catch {
      url.status = 'error';
    }
  };

  const queue = new Queue(downloadCallback, 5);

  return new Promise((resolve) => {
    const throttle = setInterval(() => {
      const nextUrl = urls.find((u) => !u.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else if (urls.every((u) => u.status)) {
        clearInterval(throttle);
        resolve(urls);
      }
    }, 250);
  });
}
