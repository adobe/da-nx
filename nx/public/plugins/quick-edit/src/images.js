import { MESSAGE_TYPES } from '../../../../utils/message-types.js';
import { imageSelectPayload } from './selection.js';

function finishImageUpload(ctx, requestId) {
  const pending = ctx?.pendingImageReplacements?.get(requestId);
  if (!pending) return null;
  ctx.pendingImageReplacements.delete(requestId);
  const stillUploading = [...ctx.pendingImageReplacements.values()]
    .some(({ picture }) => picture === pending.picture);
  if (!stillUploading) {
    pending.picture?.classList.remove('image-uploading');
  }
  return pending;
}

export function handleImageError(error, requestId, ctx) {
  if (requestId != null) finishImageUpload(ctx, requestId);
  else if (ctx?.pendingImageReplacements) {
    [...ctx.pendingImageReplacements.keys()].forEach((id) => finishImageUpload(ctx, id));
  }
  // eslint-disable-next-line no-console
  console.error('Image upload failed:', error);
}

export function setupContentEditableListeners(ctx) {
  const editableElements = document.querySelectorAll('[data-prose-index]');
  editableElements.forEach((element) => {
    const dataCursor = parseInt(element.getAttribute('data-prose-index'), 10);

    ctx.port.postMessage({
      type: MESSAGE_TYPES.GET_EDITOR,
      payload: { cursorOffset: dataCursor },
    });
  });
}

export function setupImageDropListeners(ctx, dom = document) {
  const images = dom.querySelectorAll('picture img');
  ctx.pendingImageReplacements ??= new Map();

  images.forEach((img) => {
    const picture = img.closest('picture');

    if (img.listeners) {
      img.removeEventListener('dragenter', img.listeners.dragenter);
      img.removeEventListener('dragover', img.listeners.dragover);
      img.removeEventListener('dragleave', img.listeners.dragleave);
      img.removeEventListener('drop', img.listeners.drop);
      img.listeners = null;
    }

    img.listeners = {
      dragenter: (e) => {
        e.preventDefault();
        e.stopPropagation();
        picture?.classList.add('image-drop-target');
      },
      dragover: (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      },
      dragleave: (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only remove if we're actually leaving the picture element
        const { relatedTarget } = e;
        if (!picture?.contains(relatedTarget)) {
          picture?.classList.remove('image-drop-target');
        }
      },
      drop: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        picture?.classList.remove('image-drop-target');

        const file = e.dataTransfer.files[0];
        if (!file?.type.startsWith('image/')) return;

        const proseIndex = imageSelectPayload(img)?.proseIndex;
        const imageVersion = img.getAttribute('data-image-version');
        if (!Number.isSafeInteger(proseIndex) || !imageVersion) {
          handleImageError('Image position is unavailable or out of date. Please refresh and try again.');
          return;
        }
        const requestId = crypto.randomUUID();
        ctx.pendingImageReplacements.set(requestId, { img, picture, proseIndex });

        picture?.classList.add('image-uploading');

        const reader = new FileReader();
        reader.onload = () => {
          const currentIndex = imageSelectPayload(img)?.proseIndex;
          if (!img.isConnected || !Number.isSafeInteger(currentIndex)
            || img.getAttribute('data-image-version') !== imageVersion) {
            handleImageError('Image position changed. Please try again.', requestId, ctx);
            return;
          }
          const pending = ctx.pendingImageReplacements.get(requestId);
          if (!pending) {
            handleImageError('Image upload was cancelled.');
            return;
          }
          pending.proseIndex = currentIndex;
          const imageData = reader.result;
          const { name: fileName, type: mimeType } = file;
          ctx.port.postMessage({
            type: MESSAGE_TYPES.IMAGE_REPLACE,
            payload: {
              proseIndex: currentIndex,
              requestId,
              imageVersion,
              imageData,
              fileName,
              mimeType,
              originalSrc: img.src,
            },
          });
        };
        reader.onerror = () => {
          handleImageError('Failed to read image file', requestId, ctx);
        };
        reader.readAsDataURL(file);
      },
    };

    img.addEventListener('dragenter', img.listeners.dragenter);
    img.addEventListener('dragover', img.listeners.dragover);
    img.addEventListener('dragleave', img.listeners.dragleave);
    img.addEventListener('drop', img.listeners.drop);
  });
}

export function updateImageSrc(requestId, newSrc, ctx) {
  if (requestId == null || !newSrc) {
    handleImageError('Image replacement response is incomplete.', requestId, ctx);
    return;
  }
  const pending = finishImageUpload(ctx, requestId);
  if (!pending) {
    // eslint-disable-next-line no-console
    console.error('Could not find pending image replacement:', requestId);
    return;
  }
  const { img: targetImg, picture, proseIndex } = pending;
  if (!targetImg.isConnected || imageSelectPayload(targetImg)?.proseIndex !== proseIndex) {
    return;
  }

  targetImg.src = newSrc;

  // Update all source elements in the picture
  if (picture) {
    const newUrl = new URL(newSrc, window.location.href);
    const basePath = `${newUrl.origin}${newUrl.pathname}`;

    picture.querySelectorAll('source').forEach((source) => {
      const srcset = source.getAttribute('srcset');
      if (srcset) {
        // Extract width and format params from existing srcset
        try {
          const existingUrl = new URL(srcset, window.location.href);
          const width = existingUrl.searchParams.get('width');
          const format = existingUrl.searchParams.get('format');
          const optimize = existingUrl.searchParams.get('optimize');

          let newSrcset = basePath;
          const params = [];
          if (width) params.push(`width=${width}`);
          if (format) params.push(`format=${format}`);
          if (optimize) params.push(`optimize=${optimize}`);
          if (params.length) newSrcset += `?${params.join('&')}`;

          source.setAttribute('srcset', newSrcset);
        } catch {
          // If URL parsing fails, just use the new basePath
          source.setAttribute('srcset', basePath);
        }
      }
    });
  }
}
