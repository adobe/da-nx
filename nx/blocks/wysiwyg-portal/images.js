import { daFetch } from "../../utils/daFetch.js";
import { DA_ORIGIN } from "../../public/utils/constants.js";

function updateImageInDocument(originalSrc, newSrc) {
  if (!window.view) return false;

  const { state } = window.view;
  const { tr } = state;
  let updated = false;

  // Traverse the document to find image nodes
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      const currentSrc = node.attrs.src;

      // Check if this is the image we're looking for
      // Compare by exact match or by pathname
      let isMatch = currentSrc === originalSrc;

      if (!isMatch) {
        try {
          const currentUrl = new URL(currentSrc, window.location.href);
          const originalUrl = new URL(originalSrc, window.location.href);
          isMatch = currentUrl.pathname === originalUrl.pathname;
        } catch {
          // If URL parsing fails, try simple includes check
          isMatch = currentSrc.includes(originalSrc) || originalSrc.includes(currentSrc);
        }
      }

      if (isMatch) {
        // Update the image node with new src
        const newAttrs = { ...node.attrs, src: newSrc };
        tr.setNodeMarkup(pos, null, newAttrs);
        updated = true;
      }
    }
  });

  if (updated) {
    window.view.dispatch(tr);
  }

  return updated;
}

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

export async function handleImageReplace({ imageData, fileName, originalSrc }, ctx) {
  // Suppress rerender for the entire duration of image replacement
  ctx.suppressRerender = true;

  try {
    // eslint-disable-next-line no-console
    console.log('handleImageReplace', fileName, originalSrc);
    // Convert base64 to Blob
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
      ctx.port.postMessage({
        type: 'image-error',
        error: `Upload failed with status ${resp.status}`,
        originalSrc,
      });
      return;
    }

    // Construct the new image URL (AEM delivery URL)
    const newSrc = `https://content.da.live/${ctx.owner}/${ctx.repo}${uploadPath}`;

    // Update the ProseMirror document with the new image src
    updateImageInDocument(originalSrc, newSrc);

    // Send back the new URL to update the quick-edit view
    ctx.port.postMessage({
      type: 'update-image-src',
      newSrc,
      originalSrc,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error replacing image:', error);
    ctx.port.postMessage({
      type: 'image-error',
      error: error.message,
      originalSrc,
    });
  } finally {
    // Reset the suppress flag after a delay to catch any async callbacks
    setTimeout(() => {
      ctx.suppressRerender = false;
    }, 500);
  }
}