import { addDnt, removeDnt } from '../../dnt/dnt.js';
import downloadQueue from '../../utils/downloadQueue.js';
import authReady, { getAccessToken as getCachedAccessToken } from '../../utils/auth.js';
import { corsFetch } from './utils.js';

export const dnt = { addDnt };

const INTEGRATION_NAME = 'trados';

export function isConnected(service) {
  return authReady(INTEGRATION_NAME, service);
}

export function connect(service) {
  return authReady(INTEGRATION_NAME, service);
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
  const token = await getCachedAccessToken(INTEGRATION_NAME, service);
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

/**
 * Builds a `fetchWithRetry` `onUnauthorized` callback: forces a fresh
 * Trados login (bypassing the cached token, which the server can reject -
 * e.g. revoked, or clock skew - even though the client's own expiry check
 * still considered it valid) and rebuilds `opts` with the new bearer
 * token, so a 401 triggers exactly one retry with a valid token instead
 * of failing the request outright.
 * @param {Object} service - The service configuration.
 * @param {Object} opts - The fetch options to rebuild on success.
 * @returns {() => Promise<Object|null>} Callback for `fetchWithRetry`'s
 *  `onUnauthorized` config.
 */
function onUnauthorized(service, opts) {
  return async () => {
    const token = await getCachedAccessToken(INTEGRATION_NAME, service, { force: true });
    if (!token) return null;
    return { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } };
  };
}

/**
 * Builds the `fetchWithRetry` config for a request: a per-request
 * `onUnauthorized` callback for reactive re-auth on a 401.
 * @param {Object} service - The service configuration.
 * @param {Object} opts - The fetch options to rebuild on a 401.
 * @returns {Object} The `fetchWithRetry` config.
 */
function retryConfig(service, opts) {
  return { onUnauthorized: onUnauthorized(service, opts) };
}

function ensureExtension(path) {
  if (path.endsWith('.html')) return path;

  // Add .html to `file-name.json` so when we get
  // the doc back, we know it was originally json
  return `${path}.html`;
}

// --- Project Operations ---

// Trados's max page size (the `top` param) is 100 - see
// https://developers.rws.com/languagecloud-api-docs/ ListProjectTasks.
const LIST_PAGE_LIMIT = 100;

/**
 * Fetches every item from a paginated Trados list endpoint via its
 * `skip`/`top` params, aggregating across pages instead of returning only
 * the first page - Trados caps list endpoints at `LIST_PAGE_LIMIT` items
 * per page by default, which would otherwise silently undercount a
 * project with more items than one page (e.g. many files x languages x
 * workflow steps of tasks, or many files x languages of target-files).
 * @param {Object} service - The service configuration.
 * @param {string} url - The endpoint url, including any query params
 *  (e.g. `fields`) but not `skip`/`top`.
 * @returns {Promise<Object[]|null>} All items, or null if any page fails.
 */
async function fetchAllPages(service, url) {
  const items = [];
  let skip = 0;
  let itemCount = Infinity;
  const separator = url.includes('?') ? '&' : '?';

  while (skip < itemCount) {
    // eslint-disable-next-line no-await-in-loop
    const opts = await getOpts(service);
    const pageUrl = `${url}${separator}skip=${skip}&top=${LIST_PAGE_LIMIT}`;
    // eslint-disable-next-line no-await-in-loop
    const resp = await corsFetch(pageUrl, opts, retryConfig(service, opts));
    if (!resp.ok) return null;

    // eslint-disable-next-line no-await-in-loop
    const json = await resp.json();
    const pageItems = json.items || [];
    items.push(...pageItems);
    itemCount = json.itemCount ?? items.length;

    // Guard against an infinite loop if itemCount is ever wrong.
    if (!pageItems.length) break;
    skip += pageItems.length;
  }

  return items;
}

/**
 * Fetches custom field definitions from Trados and builds a lookup map.
 * @param {Object} service - The service configuration
 * @param {Function} sendMessage - Optional callback for sending debug messages
 * @returns {Promise<Map>} Map of field names to their definitions (key, type, picklist, etc.)
 */
async function getCustomFieldDefinitions(service) {
  const { apiEndpoint } = service;
  const definitions = await fetchAllPages(
    service,
    `${apiEndpoint}/custom-field-definitions?fields=id,name,key,type,description,defaultValue,isMandatory`,
  );

  // Build a lookup map: name -> definition
  return new Map((definitions || []).map((def) => [def.name, def]));
}

/**
 * Creates a new Trados project for a translation request.
 * @param {Object} options - Project options (e.g. `project.due`,
 *  `source.language`, `translation.service.custom*` custom fields).
 * @param {Object} service - The service configuration.
 * @param {string} title - The project title.
 * @param {Object[]} langs - Target languages; reads `trados location`/
 *  `trados project template` off the first entry.
 * @param {Function} sendMessage - Callback to surface a warning (unknown
 *  custom field) or error (project creation failed) message.
 * @returns {Promise<string|null>} The new project's id, or null on failure.
 */
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
  const resp = await corsFetch(`${apiEndpoint}/projects`, opts, retryConfig(service, opts));

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

/**
 * Uploads every source file to a Trados project.
 * @param {Object} options - Project options; `source.language` sets the
 *  source language.
 * @param {Object} service - The service configuration.
 * @param {string} projectId - The target project id.
 * @param {Object[]} urls - The urls to upload; mutated in place with
 *  `sourceFileId` on success.
 * @param {Function} sendMessage - Callback to surface an error message
 *  per url that fails to upload.
 * @returns {Promise<number>} The number of files successfully uploaded.
 */
async function uploadFiles(options, service, projectId, urls, sendMessage) {
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
    const resp = await corsFetch(`${apiEndpoint}/projects/${projectId}/source-files`, opts, retryConfig(service, opts));
    if (resp.ok) {
      const json = await resp.json();
      url.sourceFileId = json.id;
      uploaded += 1;
    } else {
      sendMessage({ text: `Error uploading ${url.daBasePath} to Trados.`, type: 'error' });
    }
  }

  return uploaded;
}

/**
 * Starts a Trados project, kicking off its workflow.
 * @param {Object} service - The service configuration.
 * @param {string} projectId - The project id to start.
 * @returns {Promise<boolean>} Whether the project started (a 202 means
 *  Trados accepted the request and is starting it asynchronously).
 */
async function startProject(service, projectId) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'PUT');
  const resp = await corsFetch(`${apiEndpoint}/projects/${projectId}/start`, opts, retryConfig(service, opts));
  return resp.ok || resp.status === 202;
}

// --- Exports ---

/**
 * Sends a translation project's urls to Trados for every target language:
 * creates a project, uploads all source files, then starts it.
 * @param {Object} params
 * @param {string} params.title - The project title.
 * @param {Object} params.service - The service configuration; mutated
 *  with `projectId` on success.
 * @param {Object} params.options - Project options (e.g. `project.due`,
 *  `source.language`).
 * @param {Object[]} params.langs - Target languages; mutated in place with
 *  `translation` status.
 * @param {Object[]} params.urls - The urls to translate.
 * @param {Object} params.actions - `{ sendMessage, saveState }` callbacks.
 * @returns {Promise<void>}
 */
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
  const uploaded = await uploadFiles(options, service, projectId, urls, sendMessage);

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
  const sourceTasks = tasks.filter((task) => task.input?.type === 'sourceFile');
  if (!sourceTasks.length) return null;
  if (sourceTasks.some((t) => t.status === 'failed')) return 'error';
  if (sourceTasks.some((t) => t.status === 'canceled')) return 'canceled';
  if (sourceTasks.some((t) => t.status === 'skipped')) return 'skipped';
  return null;
}

/**
 * Determines a language's translation status from its Trados tasks.
 * `file-delivery` is the terminal step of Trados's workflow - other task
 * types (e.g. translation-memory matching, machine translation) mark
 * progression through the workflow, not completion of the language itself.
 * @param {Object[]} tasks - All tasks for the project.
 * @param {string} langCode - The target language code to check.
 * @param {number} fileCount - The number of files expected for this lang.
 * @returns {{status: string, translated: number}} The language's status
 *  (`'error'`, `'translated'`, or `'in progress'`) and the number of files
 *  delivered so far.
 */
export function getLangStatus(tasks, langCode, fileCount) {
  const langTasks = tasks.filter((task) => (
    task.input?.targetFile?.languageDirection?.targetLanguage?.languageCode === langCode
  ));

  // Translated file count for this lang
  const translated = langTasks.filter((t) => (
    t.taskType?.key === 'file-delivery' && t.status === 'completed'
  )).length;

  if (langTasks.some((t) => t.status === 'failed')) return { status: 'error', translated };
  if (translated === fileCount) return { status: 'translated', translated };

  return { status: 'in progress', translated };
}

/**
 * Fetches every task for a project, paging through Trados's tasks list
 * rather than taking the first page as the complete set - a project with
 * more tasks than one page (e.g. many files x languages x workflow steps)
 * would otherwise silently undercount completed work.
 * @param {Object} service - The service configuration.
 * @param {string} projectId - The Trados project id.
 * @returns {Promise<Object[]|null>} All tasks, or null if any page fails.
 */
function fetchAllTasks(service, projectId) {
  const { apiEndpoint } = service;
  return fetchAllPages(
    service,
    `${apiEndpoint}/projects/${projectId}/tasks?fields=taskType,status,input.targetFile`,
  );
}

/**
 * Refreshes translation status for every target language of a project by
 * polling Trados's task list.
 * @param {Object} params
 * @param {Object} params.service - The service configuration.
 * @param {Object[]} params.langs - Target languages; mutated in place with
 *  `translation.status`/`translation.translated`. A lang already at
 *  `'complete'` (saved to DA) or `'cancelled'` is left untouched - both
 *  are terminal, and Trados keeps reporting completed file-delivery
 *  tasks indefinitely, which would otherwise look "newly finished" (or
 *  un-cancel a cancelled lang) on every subsequent check.
 * @param {Object[]} params.urls - The urls in the project.
 * @param {Object} params.actions - `{ sendMessage, saveState }` callbacks;
 *  `sendMessage` surfaces an error if the tasks fetch fails, leaving langs
 *  untouched rather than misreporting them.
 * @returns {Promise<void>}
 */
export async function getStatusAll({ service, langs, urls, actions }) {
  const { sendMessage, saveState } = actions;

  const projectId = langs[0]?.translation?.projectId;
  if (!projectId) return;

  const localesStr = langs.map((lang) => lang.code).join(', ');
  sendMessage({ text: `Getting status for ${localesStr}` });

  const tasks = await fetchAllTasks(service, projectId);
  if (!tasks) {
    sendMessage({ text: 'Checking status failed for Trados project.', type: 'error' });
    return;
  }

  const sourceError = getSourceFileStatus(tasks);

  langs.forEach((lang) => {
    lang.translation ??= {};

    // 'complete'/'cancelled' are terminal - Trados keeps reporting
    // completed file-delivery tasks indefinitely, so without this guard
    // every subsequent status check would revert 'complete' back to
    // 'translated' (triggering a re-save) or 'cancelled' back to
    // 'translated' (undoing a cancel).
    if (['complete', 'cancelled'].includes(lang.translation.status)) return;

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

/**
 * Downloads and saves translated content for a completed language.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {Object} params.service - The service configuration.
 * @param {Object} params.lang - The language to save; reads
 *  `lang.translation.projectId`.
 * @param {Object[]} params.urls - The urls to download; mutated in place
 *  with `sourceContent`/`status`.
 * @param {Function} params.saveFn - Called with each url once its
 *  translated content is ready to persist.
 * @param {Function} params.sendMessage - Callback to surface an error
 *  message to the user - called if the target-files list fails to fetch,
 *  or per url that fails to download.
 * @returns {Promise<Object[]>} The same `urls`, once all have a `status`.
 */
export async function saveItems({
  org,
  site,
  service,
  lang,
  urls,
  saveFn,
  sendMessage,
}) {
  const { apiEndpoint } = service;
  const projectId = lang?.translation?.projectId;
  if (!projectId) return urls;

  // Get target files for this project
  const targetFiles = await fetchAllPages(
    service,
    `${apiEndpoint}/projects/${projectId}/target-files?fields=latestVersion,languageDirection.targetLanguage,sourceFile`,
  );
  if (!targetFiles) {
    sendMessage({ text: 'Fetching Trados target files failed.', type: 'error' });
    return urls;
  }

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
      sendMessage({ text: `No Trados target file found for ${url.daBasePath}.`, type: 'error' });
      url.status = 'error';
      return;
    }

    try {
      const dlUrl = `${apiEndpoint}/projects/${projectId}/target-files/${tf.id}/versions/${tf.latestVersion.id}/download`;
      const dlOpts = await getOpts(service);
      const dlResp = await corsFetch(dlUrl, dlOpts, retryConfig(service, dlOpts));
      if (!dlResp.ok) throw new Error(`request failed with status ${dlResp.status}`);

      const text = await dlResp.text();
      const ext = url.daBasePath.includes('.json') ? 'json' : 'html';
      url.sourceContent = await removeDnt({ org, site, html: text, ext });

      await saveFn(url);
    } catch (error) {
      sendMessage({ text: `Download failed for ${url.daBasePath}: ${error.message}`, type: 'error' });
      url.status = 'error';
    }
  };

  return downloadQueue(urls, downloadCallback);
}
