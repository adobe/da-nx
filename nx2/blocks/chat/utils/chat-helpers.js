// Shared shape for "what the user had selected/attached" sent to either backend.
// da-agent's chat-controller.js keeps its own inline copy of this (untouched, per its
// own file's stability) — this extraction is what chat-controller-ao.js uses today,
// and a candidate to fold chat-controller.js's copy into later if that file is ever
// revisited on its own merits.
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
