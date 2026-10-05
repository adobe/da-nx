export function createFileDropHandlers({ isAllowed, onDragging, onFiles }) {
  return {
    onDragEnter(e) {
      e.preventDefault();
      onDragging(true);
    },

    onDragLeave(e) {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      onDragging(false);
    },

    onDragOver(e) {
      e.preventDefault();
    },

    async onDrop(e) {
      e.preventDefault();
      onDragging(false);
      const { files } = e.dataTransfer ?? {};
      if (!files?.length) return;
      const accepted = isAllowed ? Array.from(files).filter(isAllowed) : Array.from(files);
      await onFiles(accepted);
    },
  };
}
