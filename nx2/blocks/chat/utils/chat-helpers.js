// Shared shape for "what the user had selected/attached", reused by nx-chat-ao's
// ao-controller.js. da-agent's own chat-controller.js keeps its own inline copy.
export function buildSelectionContext(context) {
  return context
    .filter((item) => {
      const t = item.type ?? (item.blockName ? 'block' : null);
      if (t === 'block' || t === 'file' || t === 'folder' || t === 'image') return !!item.blockName;
      if (t === 'text') return !!item.innerHTML;
      return false;
    })
    .map((item) => {
      const t = item.type ?? 'block';
      const { proseIndex } = item;
      if (t === 'text') {
        return {
          type: 'text',
          ...(typeof proseIndex === 'number' && { proseIndex }),
          innerHTML: item.innerHTML,
        };
      }
      return {
        type: t,
        ...(typeof proseIndex === 'number' && { proseIndex }),
        blockName: item.blockName,
        ...(item.innerText && { innerText: item.innerText }),
      };
    });
}

export function buildAttachmentsMeta(attachments) {
  return attachments.map(({
    id, fileName, mediaType, sizeBytes,
  }) => ({
    id, fileName, mediaType, ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
  }));
}

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
