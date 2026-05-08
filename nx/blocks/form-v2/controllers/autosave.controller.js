import { saveJsonDocument } from '../services/persistence/json-api.js';

export function createAutosaveController({
  path,
  savingStore,
}) {
  return {
    async persist({ json }) {
      if (!path) {
        return { ok: false, error: 'Missing document path for autosave.' };
      }

      const result = await saveJsonDocument({ path, json });

      if (result?.error) {
        savingStore?.markFailed?.(result.error);
        return { ok: false, ...result };
      }

      savingStore?.markSaved?.();
      return { ok: true };
    },
  };
}
