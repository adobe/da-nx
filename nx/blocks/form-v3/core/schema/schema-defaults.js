function pickValidation(schema = {}) {
  const ruleNames = [
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'pattern',
    'minItems',
    'maxItems',
  ];

  return ruleNames.reduce((acc, name) => {
    if (schema[name] !== undefined) acc[name] = schema[name];
    return acc;
  }, {});
}

function detectWidget(schema = {}) {
  if (Array.isArray(schema.enum)) return 'select';
  if (schema.type === 'boolean') return 'checkbox';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.format === 'textarea') return 'textarea';
  return 'text';
}

export function getNodeDefaults({ schema = {}, kind }) {
  return {
    readonly: !!(schema.readOnly ?? schema.readonly),
    defaultValue: schema.default,
    validation: pickValidation(schema),
    ui: {
      widget: detectWidget(schema),
    },
    minItems: kind === 'array' ? schema.minItems : undefined,
    maxItems: kind === 'array' ? schema.maxItems : undefined,
  };
}
