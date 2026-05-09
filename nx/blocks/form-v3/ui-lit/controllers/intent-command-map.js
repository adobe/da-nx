const INTENT_TO_COMMAND_TYPE = {
  'form-field-change': 'field.change',
  'form-array-add': 'array.add',
  'form-array-insert': 'array.insert',
  'form-array-remove': 'array.remove',
  'form-array-reorder': 'array.move',
  'form-nav-pointer-select': 'selection.change',
};

function normalizeArrayMovePayload(intent, command) {
  if (command.type !== 'array.move') return command;
  return {
    ...command,
    beforePointer: command.beforePointer ?? intent.toPointer ?? null,
  };
}

function normalizeSelectionPayload(intent, command) {
  if (command.type !== 'selection.change') return command;
  return {
    ...command,
    origin: command.origin ?? (intent.type === 'form-nav-pointer-select' ? 'ui' : null),
  };
}

export function toCoreCommand(intent = {}) {
  if (!intent || typeof intent !== 'object') return intent;

  const mappedType = INTENT_TO_COMMAND_TYPE[intent.type] ?? intent.type;
  if (!mappedType || typeof mappedType !== 'string') return intent;

  const base = {
    ...intent,
    type: mappedType,
  };

  return normalizeSelectionPayload(intent, normalizeArrayMovePayload(intent, base));
}
