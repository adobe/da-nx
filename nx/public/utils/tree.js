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

// eslint-disable-next-line import/prefer-default-export
export function crawl(path) {
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
    if (inProgress.length === 0 && folders.length === 0) {
      clearInterval(interval);
    }
  }, 200);

  return () => ({
    files: files.splice(0, files.length),
    complete: inProgress.length === 0,
  });
}
