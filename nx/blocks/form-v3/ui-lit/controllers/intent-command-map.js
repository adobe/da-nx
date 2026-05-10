const INTENT_ALIASES = {
  'field.change': 'form-field-change',
  'array.add': 'form-array-add',
  'array.insert': 'form-array-insert',
  'array.remove': 'form-array-remove',
  'array.move': 'form-array-reorder',
};

function parsePointer(pointer) {
  if (!pointer || typeof pointer !== 'string') return [];
  const trimmed = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  if (!trimmed) return [];
  return trimmed.split('/');
}

function toPointer(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return '';
  return `/${segments.join('/')}`;
}

function parseArrayItemPointer(pointer) {
  const segments = parsePointer(pointer);
  if (segments.length < 2) return null;

  const last = segments[segments.length - 1];
  const index = Number.parseInt(last, 10);
  if (!Number.isInteger(index) || index < 0) return null;

  return {
    arrayPointer: toPointer(segments.slice(0, -1)),
    index,
  };
}

function getPointerValue({ data, pointer }) {
  const segments = parsePointer(pointer);
  let current = data;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function getArrayLength({ coreState, pointer }) {
  const values = coreState?.document?.values;
  const array = getPointerValue({ data: values, pointer });
  return Array.isArray(array) ? array.length : 0;
}

function normalizeIntentType(type) {
  if (!type || typeof type !== 'string') return '';
  return INTENT_ALIASES[type] ?? type;
}

function toFieldChangeOperation(intent) {
  if (!intent?.pointer || typeof intent.pointer !== 'string') return null;
  return {
    steps: [
      {
        method: 'setFieldValue',
        args: [intent.pointer, intent.value],
      },
    ],
  };
}

function toArrayAddOperation(intent) {
  if (!intent?.pointer || typeof intent.pointer !== 'string') return null;
  return {
    steps: [
      {
        method: 'addArrayItem',
        args: [intent.pointer],
      },
    ],
  };
}

function toArrayRemoveOperation(intent) {
  if (!intent?.pointer || typeof intent.pointer !== 'string') return null;
  return {
    steps: [
      {
        method: 'removeArrayItem',
        args: [intent.pointer],
      },
    ],
  };
}

function toArrayReorderOperation(intent, coreState) {
  const pointer = intent?.pointer;
  if (!pointer || typeof pointer !== 'string') return null;

  const source = parseArrayItemPointer(pointer);
  if (!source) return null;

  const before = parseArrayItemPointer(intent.beforePointer ?? intent.toPointer);
  const itemCount = getArrayLength({ coreState, pointer: source.arrayPointer });
  const toIndex = before?.arrayPointer === source.arrayPointer ? before.index : itemCount;

  return {
    steps: [
      {
        method: 'moveArrayItem',
        args: [source.arrayPointer, source.index, toIndex],
      },
    ],
  };
}

function toArrayInsertOperation(intent, coreState) {
  const pointer = intent?.pointer;
  if (!pointer || typeof pointer !== 'string') return null;

  const insertAt = parseArrayItemPointer(pointer);
  if (!insertAt) return null;

  const itemCount = getArrayLength({ coreState, pointer: insertAt.arrayPointer });
  const steps = [
    {
      method: 'addArrayItem',
      args: [insertAt.arrayPointer],
    },
  ];

  if (insertAt.index < itemCount) {
    steps.push({
      method: 'moveArrayItem',
      args: [insertAt.arrayPointer, itemCount, insertAt.index],
    });
  }

  return { steps };
}

export function toCoreOperation(intent = {}, coreState = {}) {
  if (!intent || typeof intent !== 'object') return null;

  const type = normalizeIntentType(intent.type);
  if (!type) return null;

  if (type === 'form-field-change') {
    return toFieldChangeOperation(intent);
  }
  if (type === 'form-array-add') {
    return toArrayAddOperation(intent);
  }
  if (type === 'form-array-remove') {
    return toArrayRemoveOperation(intent);
  }
  if (type === 'form-array-reorder') {
    return toArrayReorderOperation(intent, coreState);
  }
  if (type === 'form-array-insert') {
    return toArrayInsertOperation(intent, coreState);
  }

  return null;
}
