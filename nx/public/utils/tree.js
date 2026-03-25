import { daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from './constants.js';

export class Queue {
  constructor(callback, maxConcurrent = 500, onError = null, throttle = null) {
    this.queue = [];
    this.activeCount = 0;
    this.maxConcurrent = maxConcurrent;
    this.throttle = throttle;
    this.callback = callback;

    this.push = this.push.bind(this);
    this.processQueue = this.processQueue.bind(this);
    this.processItem = this.processItem.bind(this);
    this.onError = onError;
  }

  async push(data) {
    this.queue.push(data);
    await this.processQueue();
  }

  async processQueue() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      await this.processItem(item);
    }
  }

  async processItem(item) {
    this.activeCount += 1;
    try {
      await this.callback(item);
    } catch (e) {
      if (this.onError) {
        this.onError(item, e);
      } else {
        throw e;
      }
    } finally {
      if (this.throttle) {
        await new Promise((resolve) => {
          setTimeout(() => { resolve(); }, this.throttle);
        });
      }
      this.activeCount -= 1;
      await this.processQueue();
    }
  }
}

async function getChildren(path) {
  const files = [];
  const folders = [];
  /** @type {object[]} */
  const folderEntries = [];
  let continuationToken = null;

  do {
    const opts = continuationToken
      ? { headers: { 'da-continuation-token': continuationToken } }
      : {};
    const resp = await daFetch(`${DA_ORIGIN}/list${path}`, opts);
    if (!resp.ok) break;

    const json = await resp.json();
    json.forEach((child) => {
      if (!child.name) {
        // eslint-disable-next-line no-console
        console.log(`This folder has a child with an empty name: ${child.path}`);
        return;
      }
      if (child.ext) {
        files.push(child);
      } else if (child.path) {
        folders.push(child.path);
        folderEntries.push(child);
      }
    });

    continuationToken = resp.headers.get('da-continuation-token');
  } while (continuationToken);

  return { files, folders, folderEntries };
}

function calculateCrawlTime(startTime) {
  const crawlTime = Date.now() - startTime;
  return String(crawlTime / 1000).substring(0, 4);
}

/**
 * Depth-first tree walk of DA list API results.
 * @param {Object} options - The crawl options.
 * @param {string|string[]} options.path - The parent path(s) to crawl.
 * @param {Object[]} options.files - Optional array of file objects to include in the crawl.
 * @param {function} options.callback - The callback to run when a file or folder is found.
 * @param {number} options.concurrent - The amount of concurrent requests for the callback queue.
 * @param {number} options.throttle - How much to throttle the crawl.
 * @param {boolean} [options.includeFolders=false] - When true, folder list rows (no `ext`) are
 *   included in `results` and passed to `callback`. Default stays file-only for existing callers.
 */
export function crawl({
  path,
  files: initialFiles = [],
  callback,
  concurrent,
  throttle = 100,
  includeFolders = false,
}) {
  let time;
  let isCanceled = false;
  const files = [...initialFiles];
  const errors = [];
  const folders = Array.isArray(path) ? [...path] : [path];
  const inProgress = [];
  const startTime = Date.now();
  const queue = new Queue(callback, concurrent, (item, err) => errors.push({ item, err }));

  const results = new Promise((resolve) => {
    if (callback && initialFiles.length > 0) {
      Promise.allSettled(initialFiles.map((file) => queue.push(file)));
    }

    const interval = setInterval(async () => {
      if (folders.length > 0) {
        inProgress.push(true);
        const currentPath = folders.pop();
        const children = await getChildren(currentPath);
        files.push(...children.files);
        if (includeFolders && children.folderEntries.length > 0) {
          files.push(...children.folderEntries);
        }
        folders.push(...children.folders);
        if (callback && children.files.length > 0) {
          await Promise.allSettled(children.files.map((file) => queue.push(file)));
        }
        if (callback && includeFolders && children.folderEntries.length > 0) {
          await Promise.allSettled(
            children.folderEntries.map((entry) => queue.push(entry)),
          );
        }
        inProgress.pop();
      }
      if ((inProgress.length === 0 && folders.length === 0) || isCanceled) {
        time = calculateCrawlTime(startTime);
        clearInterval(interval);
        resolve(files);
      }
    }, throttle);
  });

  const getDuration = () => {
    if (time) return time;
    return calculateCrawlTime(startTime);
  };

  const getCallbackErrors = () => errors;

  const cancelCrawl = () => { isCanceled = true; };
  return { results, getDuration, cancelCrawl, getCallbackErrors };
}
