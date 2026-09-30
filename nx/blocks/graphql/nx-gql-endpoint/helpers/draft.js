import { NO_SCHEMAS_MESSAGE } from '../../utils/endpoint.js';

// Editing a draft; a draft is { name, schemas, isNew }.

export function selectSchemas({ draft, ids, selected }) {
  const others = draft.schemas.filter((schemaId) => !ids.includes(schemaId));
  return { ...draft, schemas: selected ? [...new Set([...others, ...ids])].sort() : others };
}

export function isDirty({ draft, config }) {
  if (!draft) return false;
  if (!config) return true;
  return draft.schemas.join('\n') !== config.schemas.join('\n');
}

// Saving an unchanged endpoint regenerates its GraphQL schema from the current schemas.
export function getSaveState({
  draft, blocker, dirty, busy,
}) {
  const pending = draft.isNew || dirty;
  // The Schemas tab explains an empty selection, so it isn't repeated next to Save.
  const showHint = blocker && pending && blocker !== NO_SCHEMAS_MESSAGE;
  return {
    canSave: !blocker && !busy,
    hint: showHint ? blocker : undefined,
  };
}
