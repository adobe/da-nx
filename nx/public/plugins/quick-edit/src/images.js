export function setupContentEditableListeners(ctx) {
  const editableElements = document.querySelectorAll('[data-prose-index]');
  editableElements.forEach((element) => {
    const dataCursor = parseInt(element.getAttribute('data-prose-index'), 10);

    ctx.port.postMessage({
      type: 'get-editor',
      cursorOffset: dataCursor,
    });
  });
}

export function setupImageDropListeners(ctx, dom = document) {
  const images = dom.querySelectorAll('picture img');

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
        const relatedTarget = e.relatedTarget;
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
  
        // Get tracking attributes
        const dataCursor = img.getAttribute('data-prose-index');
        const originalSrc = img.src;
  
        // Show loading state
        picture?.classList.add('image-uploading');
  
        // Read and send the image to DA editor for upload
        const reader = new FileReader();
        reader.onload = () => {
          ctx.port.postMessage({
            type: 'image-replace',
            cursorOffset: dataCursor ? parseInt(dataCursor, 10) : null,
            imageData: reader.result,
            fileName: file.name,
            mimeType: file.type,
            originalSrc,
          });
        };
        reader.onerror = () => {
          picture?.classList.remove('image-uploading');
          console.error('Failed to read image file');
        };
        reader.readAsDataURL(file);
      }
    };

    img.addEventListener('dragenter', img.listeners.dragenter);
    img.addEventListener('dragover', img.listeners.dragover);
    img.addEventListener('dragleave', img.listeners.dragleave);
    img.addEventListener('drop', img.listeners.drop);
  });
}

export function updateImageSrc(originalSrc, newSrc) {
  // First, try to find by the uploading state (most reliable)
  let picture = document.querySelector('main picture.image-uploading');
  let targetImg = picture?.querySelector('img');

  // If not found by uploading state, try to match by src
  if (!targetImg) {
    const images = document.querySelectorAll('main picture img');
    
    // Extract pathname from originalSrc for comparison
    let originalPath = originalSrc;
    try {
      const originalUrl = new URL(originalSrc);
      originalPath = originalUrl.pathname;
    } catch {
      // originalSrc might be a relative path
    }

    images.forEach((img) => {
      // Compare by full src
      if (img.src === originalSrc) {
        targetImg = img;
        return;
      }
      // Compare by pathname only (ignoring query params)
      try {
        const imgUrl = new URL(img.src);
        if (imgUrl.pathname === originalPath || img.src.includes(originalPath)) {
          targetImg = img;
        }
      } catch {
        // Fallback to simple includes check
        if (img.src.includes(originalSrc) || originalSrc.includes(img.src)) {
          targetImg = img;
        }
      }
    });

    picture = targetImg?.closest('picture');
  }

  if (!targetImg) {
    console.warn('Could not find image to update:', originalSrc);
    return;
  }

  picture?.classList.remove('image-uploading');

  // Update the img src
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

export function handleImageError(error) {
  // Remove loading state on error
  const images = document.querySelectorAll('main picture.image-uploading');
  images.forEach((picture) => {
    picture.classList.remove('image-uploading');
  });
  console.error('Image upload failed:', error);
}