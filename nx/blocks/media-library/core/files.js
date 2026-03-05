const CARD_IMAGE_WIDTHS = [400, 500, 750];

export const CARD_IMAGE_SIZES = '(max-width: 480px) 100vw, (max-width: 768px) 50vw, 300px';

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`;
}

export function getFileName(url) {
  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    return pathname.split('/').pop() || '';
  } catch {
    return url.split('/').pop() || '';
  }
}

export function optimizeImageUrls(src, widths = CARD_IMAGE_WIDTHS) {
  if (!src) return null;
  try {
    const url = src.startsWith('http') ? new URL(src) : new URL(src, window.location.href);
    const base = `${url.origin}${url.pathname}`;
    const ext = url.pathname.split('.').pop()?.toLowerCase() || 'jpg';
    if (ext === 'svg') return null;

    const w = Array.isArray(widths) ? widths : [widths];
    const webpSrcset = w
      .map((width) => `${base}?width=${width}&format=webp&optimize=medium ${width}w`)
      .join(', ');
    const fallbackSrcset = w
      .map((width) => `${base}?width=${width}&format=${ext}&optimize=medium ${width}w`)
      .join(', ');
    const fallbackUrl = `${base}?width=${w[w.length - 1]}&format=${ext}&optimize=medium`;

    return {
      webpSrcset,
      fallbackSrcset,
      fallbackUrl,
    };
  } catch {
    return null;
  }
}
