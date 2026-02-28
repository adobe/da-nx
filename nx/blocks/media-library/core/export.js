import { CORS_PROXY_URL } from './constants.js';
import { getMediaType, getSubtype } from './media.js';

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

export function exportToCsv(mediaData, options = {}) {
  if (!mediaData || mediaData.length === 0) return;

  const { org, repo, filterName } = options;
  const filename = (org && repo)
    ? exportFilename(org, repo, filterName)
    : `media-export-${Date.now()}.csv`;

  const headers = ['Name', 'URL', 'Type', 'References', 'Status', 'Usage Count'];
  const rows = mediaData.map((item) => [
    escapeCsvCell(item.name || ''),
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

async function copyImageToClipboard(imageUrl) {
  let fetchUrl = imageUrl;
  try {
    const url = new URL(imageUrl);
    if (url.origin !== window.location.origin) {
      fetchUrl = `${CORS_PROXY_URL}?url=${encodeURIComponent(imageUrl)}`;
    }
  } catch (error) {
    fetchUrl = imageUrl;
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();

  let clipboardBlob = blob;
  let mimeType = blob.type;

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

  const clipboardItem = new ClipboardItem({ [mimeType]: clipboardBlob });
  await navigator.clipboard.write([clipboardItem]);
}

export async function copyMediaToClipboard(media) {
  const mediaUrl = media.url;
  const mediaType = getMediaType(media);

  try {
    if (mediaType === 'image') {
      await copyImageToClipboard(mediaUrl);
      return { heading: 'Copied', message: 'Resource Copied.' };
    }
    await navigator.clipboard.writeText(mediaUrl);
    return { heading: 'Copied', message: 'Resource URL Copied.' };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to copy to clipboard:', error);
    return { heading: 'Error', message: 'Failed to copy Resource.' };
  }
}
