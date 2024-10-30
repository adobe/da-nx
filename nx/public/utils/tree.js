/* eslint-disable import/prefer-default-export */
import { daFetch } from '../../utils/daFetch.js';

export class Queue {
  constructor(callback, maxConcurrent = 500) {
    this.queue = [];
    this.activeCount = 0;
    this.maxConcurrent = maxConcurrent;
    this.callback = callback;

    this.push = this.push.bind(this);
    this.processQueue = this.processQueue.bind(this);
    this.processItem = this.processItem.bind(this);
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
    } finally {
      this.activeCount -= 1;
      await this.processQueue();
    }
  }
}

async function getChildren(path) {
  const files = [];
  const folders = [];

  const resp = await daFetch(`https://admin.da.live/list${path}`);
  if (resp.ok) {
    const json = await resp.json();
    json.forEach((child) => {
      if (child.ext) {
        files.push(child);
      } else {
        folders.push(child.path);
      }
    });
  }
  return { files, folders };
}

function calculateCrawlTime(startTime) {
  const crawlTime = Date.now() - startTime;
  return String(crawlTime / 1000).substring(0, 4);
}

/**
 * Assign the project to an employee.
 * @param {Object} options - The crawl options.
 * @param {string} options.path - The parent path to crawl.
 * @param {function} options.callback - The callback to run when a file is found.
 * @param {number} options.concurrent - The amount of concurrent requests for the callback queue.
 * @param {number} options.throttle - How much to throttle the crawl.
 */
export function crawl({ path, callback, concurrent, throttle = 100 }) {
  let time;
  let isCanceled = false;
  const files = [];
  const folders = [path];
  const inProgress = [];
  const startTime = Date.now();
  const queue = new Queue(callback, concurrent);

  const results = new Promise((resolve) => {
    const interval = setInterval(async () => {
      if (folders.length > 0) {
        inProgress.push(true);
        const currentPath = folders.pop();
        const children = await getChildren(currentPath);
        files.push(...children.files);
        folders.push(...children.folders);
        if (callback && children.files.length > 0) {
          await Promise.all(children.files.map((file) => queue.push(file)));
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

  const cancelCrawl = () => { isCanceled = true; };
  return { results, getDuration, cancelCrawl };
}
