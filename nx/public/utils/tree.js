/* eslint-disable import/prefer-default-export */
import { daFetch } from '../../utils/daFetch.js';

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

export function crawl({ path, callback, throttle = 100 }) {
  let time;
  let isCanceled = false;
  const files = [];
  const folders = [path];
  const inProgress = [];
  const startTime = Date.now();

  const getResults = new Promise((resolve) => {
    const interval = setInterval(async () => {
      if (folders.length > 0) {
        inProgress.push(true);
        const currentPath = folders.pop();
        const children = await getChildren(currentPath);
        files.push(...children.files);
        folders.push(...children.folders);
        if (callback && children.files.length > 0) {
          await Promise.all(children.files.map(callback));
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
  return { getResults, getDuration, cancelCrawl };
}
