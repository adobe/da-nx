/* eslint-disable import/prefer-default-export */
import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { MESSAGE_TYPES } from '../../../utils/message-types.js';
import {
  resolveImagePosition, updateImageInDocument,
} from '../../../../nx2/public/utils/quick-edit-images.js';

function dataUrlToBlob(dataUrl) {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const byteString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i += 1) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new Blob([uint8Array], { type: mimeType });
}

function getPageName(currentPath) {
  if (currentPath.endsWith('/')) return `${currentPath.replace(/^\//, '')}index`;
  // Remove leading slash and .html extension if present
  return currentPath.replace(/^\//, '').replace(/\.html$/, '');
}

export async function handleImageReplace(payload, ctx) {
  const {
    imageData, fileName, proseIndex, originalSrc, requestId,
  } = payload;
  let view;
  const reply = (result) => ctx.port.postMessage({
    type: MESSAGE_TYPES.IMAGE_REPLACE,
    payload: { ...result, proseIndex, originalSrc, requestId },
  });
  try {
    view = ctx.view;
    if (!view) throw new Error('Image editor is unavailable. Please try again.');
    const originalDoc = view.state.doc;
    const imagePos = resolveImagePosition({ ...payload, doc: originalDoc });
    const target = originalDoc.nodeAt(imagePos);
    const blob = dataUrlToBlob(imageData);

    // Get the page name for the media folder
    const pageName = getPageName(ctx.path);
    const parentPath = ctx.path === '/' ? '' : ctx.path.replace(/\/[^/]+$/, '');

    // Construct the upload URL: /source/{owner}/{repo}{parent}/.{pageName}/{fileName}
    const uploadPath = `${parentPath}/.${pageName}/${fileName}`;
    const uploadUrl = `${DA_ORIGIN}/source/${ctx.owner}/${ctx.repo}${uploadPath}`;

    // Upload the image
    const formData = new FormData();
    formData.append('data', blob, fileName);
    const opts = { method: 'PUT', body: formData };
    const resp = await daFetch(uploadUrl, opts);

    if (!resp.ok) {
      reply({ error: `Upload failed with status ${resp.status}` });
      return;
    }

    // Construct the new image URL (AEM delivery URL)
    const newSrc = `https://content.da.live/${ctx.owner}/${ctx.repo}${uploadPath}`;

    if (ctx.view !== view) throw new Error('Image editor changed during the upload. Please try again.');
    updateImageInDocument({ view, target, newSrc });
    reply({ newSrc });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error replacing image:', error);
    reply({ error: error.message });
  }
}
