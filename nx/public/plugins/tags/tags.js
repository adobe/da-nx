/* eslint-disable import/no-unresolved */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { DA_ORIGIN } from 'https://da.live/nx/public/utils/constants.js';
import './tag-browser.js';

const ROOT_TAG_PATH = '/content/cq:tags';
const UI_TAG_PATH = '/ui#/aem/aem/tags';
const TAG_EXT = '.1.json';

async function getAemRepo(project, opts) {
  const configUrl = `${DA_ORIGIN}/config/${project.org}/${project.repo}`;
  const resp = await fetch(configUrl, opts);
  if (!resp.ok) return null;
  const json = await resp.json();
  const { value: repoId } = json.data.find((entry) => entry.key === 'aem.repositoryId') || {};
  const { value: namespaces } = json.data.find((entry) => entry.key === 'aem.tags.namespaces') || {};
  return { aemRepo: repoId, namespaces };
}

async function getTags(path, opts) {
  const activeTag = path.split('cq:tags').pop().replace('.1.json', '').slice(1);
  const resp = await fetch(path, opts);
  if (!resp.ok) return null;
  const json = await resp.json();
  const tags = Object.keys(json).reduce((acc, key) => {
    if (json[key]['jcr:primaryType'] === 'cq:Tag') {
      acc.push({
        path: `${path.replace(TAG_EXT, '')}/${key}${TAG_EXT}`,
        activeTag,
        name: key,
        title: json[key]['jcr:title'] || key,
        details: json[key],
      });
    }
    return acc;
  }, []);

  return tags;
}

const getRootTags = async (namespaces, aemConfig, opts) => {
  const createTagUrl = (namespace = '') => `https://${aemConfig.aemRepo}${ROOT_TAG_PATH}${namespace ? `/${namespace}` : ''}${TAG_EXT}`;

  if (namespaces.length === 0) {
    return getTags(createTagUrl(), opts).catch(() => null);
  }

  if (namespaces.length === 1) {
    const namespace = namespaces[0].toLowerCase().replaceAll(' ', '-');
    return getTags(createTagUrl(namespace), opts).catch(() => null);
  }

  return namespaces.map((title) => {
    const namespace = title.toLowerCase().replaceAll(' ', '-');
    return {
      path: createTagUrl(namespace),
      name: namespace,
      title,
      activeTag: '',
      details: {},
    };
  });
};

function showError(message, link = null) {
  const mainElement = document.body.querySelector('main');
  const errorMessage = document.createElement('p');
  errorMessage.textContent = message;

  if (link) {
    const linkEl = document.createElement('a');
    linkEl.textContent = 'View Here';
    linkEl.href = link;
    linkEl.target = '_blank';
    errorMessage.append(linkEl);
  }

  const reloadButton = document.createElement('button');
  reloadButton.textContent = 'Reload';
  reloadButton.addEventListener('click', () => window.location.reload());

  mainElement.append(errorMessage, reloadButton);
}

(async function init() {
  const { context, actions, token } = await DA_SDK.catch(() => null);
  if (!context || !actions || !token) {
    showError('Please log in to view tags.');
    return;
  }

  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const aemConfig = await getAemRepo(context, opts).catch(() => null);
  if (!aemConfig || !aemConfig.aemRepo) {
    showError('Failed to retrieve config. ', `https://da.live/config#/${context.org}/${context.repo}/`);
    return;
  }

  const namespaces = aemConfig?.namespaces.split(',').map((namespace) => namespace.trim()) || [];
  const rootTags = await getRootTags(namespaces, aemConfig, opts);

  if (!rootTags || rootTags.length === 0) {
    showError('Could not load tags. ', `https://${aemConfig.aemRepo}${UI_TAG_PATH}`);
    return;
  }

  const daTagBrowser = document.createElement('da-tag-browser');
  daTagBrowser.tabIndex = 0;
  daTagBrowser.rootTags = rootTags;
  daTagBrowser.getTags = async (tag) => getTags(tag.path, opts);
  daTagBrowser.tagValue = aemConfig.namespaces ? 'title' : 'path';
  daTagBrowser.actions = actions;
  document.body.querySelector('main').append(daTagBrowser);
}());