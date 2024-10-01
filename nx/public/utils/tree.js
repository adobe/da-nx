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

export function crawl({ path }) {
  let time;
  let cancel = false;
  const files = [];
  const folders = [path];
  const inProgress = [];
  const uuid = crypto.randomUUID();
  performance.mark(`crawl-start-${uuid}`);

  const interval = setInterval(async () => {
    if (folders.length > 0) {
      inProgress.push(true);
      const currentPath = folders.pop();
      const children = await getChildren(currentPath);
      files.push(...children.files);
      folders.push(...children.folders);
      inProgress.pop();
    }
    if ((inProgress.length === 0 && folders.length === 0) || cancel) {
      performance.mark(`crawl-end-${uuid}`);
      performance.measure(`crawl-${uuid}`, `crawl-start-${uuid}`, `crawl-end-${uuid}`);
      const searchTime = performance.getEntriesByName(`crawl-${uuid}`)[0].duration;
      time = String(searchTime / 1000).substring(0, 4);
      clearInterval(interval);
    }
  }, 100);

  const getCrawled = () => ({
    files: files.splice(0, files.length),
    complete: cancel || inProgress.length === 0,
  });

  const cancelCrawl = () => {
    cancel = true;
  };

  const getTime = () => time;

  return { getCrawled, cancelCrawl, getTime };
}
