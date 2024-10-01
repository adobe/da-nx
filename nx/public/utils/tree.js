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
  // eslint-disable-next-line prefer-const
  let cancel = false;
  const files = [];
  const folders = [path];
  const inProgress = [];

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
      clearInterval(interval);
    }
  }, 200);

  const getCrawled = () => ({
    files: files.splice(0, files.length),
    complete: inProgress.length === 0,
  });

  return { cancel, getCrawled };
}
