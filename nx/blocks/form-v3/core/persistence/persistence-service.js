function missingAdapterResult() {
  return {
    ok: false,
    error: 'Missing persistence adapter.',
  };
}

export function createPersistenceService({ saveDocument } = {}) {
  async function persist({ path, document }) {
    if (!path) {
      return {
        ok: false,
        error: 'Missing document path.',
      };
    }

    if (!document || typeof document !== 'object') {
      return {
        ok: false,
        error: 'Invalid document payload.',
      };
    }

    if (typeof saveDocument !== 'function') {
      return missingAdapterResult();
    }

    const result = await saveDocument({ path, document });
    if (result?.ok) {
      return { ok: true };
    }

    return {
      ok: false,
      error: result?.error ?? 'Persistence failed.',
      status: result?.status,
    };
  }

  return {
    persist,
  };
}
