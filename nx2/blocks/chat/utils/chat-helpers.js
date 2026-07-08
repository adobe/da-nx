export function buildAttachmentPayload(items) {
  return items
    .filter((item) => item.dataBase64)
    .map(({ id, fileName, mediaType, sizeBytes, dataBase64 }) => ({
      id,
      fileName,
      mediaType,
      dataBase64,
      ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    }));
}

export function buildSlashMessage(inputValue, selectionStart, wordStart, skillId) {
  const before = inputValue.slice(0, wordStart ?? 0).trimEnd();
  const after = inputValue.slice(selectionStart).trimStart();
  return [before, `/${skillId}`, after].filter(Boolean).join(' ');
}
