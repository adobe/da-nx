export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Caps to maxFiles, reads each as base64, and shapes the result into the item
// shape nx-pills/attachment payloads expect. Skips (rather than throws on) an
// oversized or unreadable file — the caller decides what, if anything, to add.
export async function buildAttachmentItems(fileList, {
  currentCount = 0, maxFiles = 20, maxFileSize,
} = {}) {
  const available = Math.max(0, maxFiles - currentCount);
  const files = Array.from(fileList).slice(0, available);
  if (!files.length) return [];

  const results = await Promise.all(files.map(async (file) => {
    if (maxFileSize && file.size > maxFileSize) return null;
    try {
      const dataBase64 = await readFileAsBase64(file);
      if (!dataBase64) return null;
      const isImage = file.type?.startsWith('image/');
      return {
        id: crypto.randomUUID(),
        label: file.name,
        type: isImage ? 'image' : 'file',
        fileName: file.name,
        mediaType: file.type,
        sizeBytes: file.size,
        dataBase64,
        ...(isImage ? { thumbnail: URL.createObjectURL(file) } : {}),
      };
    } catch {
      return null;
    }
  }));

  return results.filter(Boolean);
}
