import { etcFetch } from './urls.js';
import { getMediaType, getSubtype } from './media.js';
import { t } from './messages.js';
import { isMediaLibraryPluginMode } from './utils.js';

function escapeCsvCell(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportFilename(org, repo, filterName) {
  const slug = (s) => (s || 'unknown').replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
  const filterSlug = (filterName || 'all').replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${slug(org)}-${slug(repo)}-media-${filterSlug || 'all'}-${date}.csv`;
}

// Exports media to CSV string; optionally filtered.
export function exportToCsv(mediaData, options = {}) {
  if (!mediaData || mediaData.length === 0) return;

  const { org, repo, filterName } = options;
  const filename = (org && repo)
    ? exportFilename(org, repo, filterName)
    : `media-export-${Date.now()}.csv`;

  const headers = ['Name', 'URL', 'Type', 'References', 'Status', 'Usage Count'];
  const rows = mediaData.map((item) => [
    escapeCsvCell(item.displayName || item.name || ''),
    escapeCsvCell(item.url || ''),
    escapeCsvCell(getSubtype(item)),
    escapeCsvCell(item.doc || ''),
    escapeCsvCell(item.status || ''),
    escapeCsvCell(item.usageCount ?? ''),
  ]);
  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

const DA_SDK_LOAD_MS = 3000;

async function getDaSdkActions() {
  const { default: DA_SDK } = await import('../../../utils/sdk.js');
  return Promise.race([
    DA_SDK.then((sdk) => {
      const { actions } = sdk || {};
      if (!actions?.sendText || !actions?.sendHTML) {
        throw new Error('da-sdk-actions-unavailable');
      }
      return actions;
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('da-sdk-timeout')), DA_SDK_LOAD_MS);
    }),
  ]);
}

/** Insert via DA SDK: image as HTML, else plain URL (matches clipboard payloads). */
async function insertMediaViaPluginSdk(media) {
  const mediaUrl = media.url;
  const mediaType = getMediaType(media);
  const actions = await getDaSdkActions();

  if (mediaType === 'image') {
    const escapedUrl = escapeHtml(mediaUrl);
    actions.sendHTML(`<img src="${escapedUrl}">`);
    return;
  }
  actions.sendText(mediaUrl);
}

async function copyImageToClipboard(imageUrl) {
  let response;
  try {
    const url = new URL(imageUrl);
    if (url.origin !== window.location.origin) {
      response = await etcFetch(imageUrl, 'cors');
    }
  } catch (e) {
    /* fall through to direct fetch for invalid or relative URLs */
  }

  response ||= await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();

  let clipboardBlob = blob;
  let mimeType = blob.type;

  // Clipboard API only supports image/png, image/gif, image/webp
  // Convert other formats (like JPEG) to PNG
  if (!['image/png', 'image/gif', 'image/webp'].includes(blob.type)) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    clipboardBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    mimeType = 'image/png';

    URL.revokeObjectURL(img.src);
  }

  // Copy multiple formats like browser's "Copy image" does
  // Include HTML and text with the original URL so document editors can deduplicate
  const escapedUrl = escapeHtml(imageUrl);
  const clipboardItem = new ClipboardItem({
    [mimeType]: clipboardBlob,
    'text/html': new Blob([`<img src="${escapedUrl}">`], { type: 'text/html' }),
    'text/plain': new Blob([imageUrl], { type: 'text/plain' }),
  });

  await navigator.clipboard.write([clipboardItem]);
}

export async function copyMediaToClipboard(media) {
  const mediaUrl = media.url;
  const mediaType = getMediaType(media);

  if (isMediaLibraryPluginMode()) {
    try {
      await insertMediaViaPluginSdk(media);
      if (mediaType === 'image') {
        return { heading: t('NOTIFY_INSERTED'), message: t('NOTIFY_INSERTED_IMAGE') };
      }
      return { heading: t('NOTIFY_INSERTED'), message: t('NOTIFY_INSERTED_URL') };
    } catch (pluginErr) {
      // eslint-disable-next-line no-console
      console.warn('[media-library] Plugin insert unavailable, falling back to clipboard:', pluginErr?.message || pluginErr);
    }
  }

  try {
    if (mediaType === 'image') {
      await copyImageToClipboard(mediaUrl);
      return { heading: t('NOTIFY_COPIED'), message: t('NOTIFY_COPIED_IMAGE') };
    }
    await navigator.clipboard.writeText(mediaUrl);
    return { heading: t('NOTIFY_COPIED'), message: t('NOTIFY_COPIED_URL') };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to copy to clipboard:', error);
    return { heading: t('NOTIFY_ERROR'), message: t('NOTIFY_COPY_ERROR') };
  }
}
