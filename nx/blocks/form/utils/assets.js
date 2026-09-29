import { source } from '../../../../nx2/utils/api.js';
import { loadIms } from '../../../../nx2/utils/ims.js';
import { DA_CONTENT, DA_PREVIEW } from '../../../../nx2/utils/utils.js';

const IMAGE_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif']);
const MEDIA_PREFIX = './media_';

const isWebHref = (href) => /^https?:\/\//i.test(href);

export function mediaPreviewOrigin({ owner, repo }) {
  const { protocol, host } = new URL(DA_PREVIEW);
  return `${protocol}//main--${repo}--${owner}.${host}`;
}

async function loadAccessToken() {
  const { accessToken } = await loadIms();
  return accessToken?.token;
}

// Uploaded images only display with an auth cookie from the origin that serves them.
// Media Bus images come from the DA preview origin.
// Legacy DA uploads come from the DA content origin.
// Like Canvas, log into both origins once per site before showing a preview.
// Public images still display when the login fails.
export const openMediaPreview = (() => {
  const logins = new Map();

  const login = async ({ cookieHrefs, getToken, request }) => {
    try {
      const token = await getToken();
      if (!token) return false;
      const responses = await Promise.all(cookieHrefs.map((href) => request(href, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      })));
      return responses.every((response) => response.ok);
    } catch {
      return false;
    }
  };

  return async ({
    owner,
    repo,
    getToken = loadAccessToken,
    request = fetch,
  }) => {
    const origin = mediaPreviewOrigin({ owner, repo });
    if (!logins.has(origin)) {
      const cookieHrefs = [`${origin}/gimme_cookie`, `${DA_CONTENT}/${owner}/${repo}/.gimme_cookie`];
      logins.set(origin, login({ cookieHrefs, getToken, request }).then((ok) => {
        if (!ok) logins.delete(origin);
      }));
    }
    await logins.get(origin);
    return origin;
  };
})();

export function imagePreviewHref({ href, previewOrigin }) {
  if (typeof href !== 'string') {
    return '';
  }

  try {
    if (isWebHref(href)) {
      return new URL(href).href;
    }
    if (href.startsWith(MEDIA_PREFIX) && previewOrigin) {
      return new URL(href, `${previewOrigin}/`).href;
    }
  } catch {
    return '';
  }
  return '';
}

export function createMediaPath({ details, fileName }) {
  const { owner, repo, fullpath } = details ?? {};
  const prefix = `/${owner}/${repo}/`;
  if (!owner || !repo || !fullpath?.startsWith(prefix) || !fullpath.endsWith('.html')) {
    throw new Error('The form document path is unavailable for image upload.');
  }
  if (!fileName || /[/\\?#]/.test(fileName) || fileName === '.' || fileName === '..') {
    throw new Error('The image file name is invalid.');
  }

  const directory = fullpath.slice(prefix.length - 1, fullpath.lastIndexOf('/'));
  const documentName = fullpath.slice(fullpath.lastIndexOf('/') + 1, -'.html'.length);
  return `${directory}/.${documentName}/${fileName}`;
}

export function chooseImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [...IMAGE_TYPES].join(',');
    input.hidden = true;

    const finish = (file) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function uploadImage({
  details,
  file,
  upload = source.uploadMedia,
}) {
  if (!IMAGE_TYPES.has(file?.type)) {
    throw new Error('Choose an SVG, PNG, JPEG, or GIF image.');
  }

  const path = createMediaPath({ details, fileName: file.name });
  const response = await upload({
    org: details.owner,
    site: details.repo,
    path,
    body: file,
  });
  if (!response?.ok) {
    throw new Error(`Image upload failed with status ${response?.status ?? 'unknown'}.`);
  }

  const result = await response.json();
  const href = result?.source?.contentUrl;
  if (typeof href !== 'string' || !(href.startsWith(MEDIA_PREFIX) || isWebHref(href))) {
    throw new Error('The upload did not return a usable image URL.');
  }

  return { href, name: file.name };
}

export async function selectImageSource({
  details,
  chooseFile = chooseImageFile,
  upload = uploadImage,
}) {
  const file = await chooseFile();
  if (!file) {
    return { cancelled: true };
  }
  return upload({ details, file });
}
