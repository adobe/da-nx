// Array root, hyphenated keys, recursion, empty object, unresolved $ref,
// reserved keys, an array of arrays and a node without a type.
export default {
  $defs: {
    Node: {
      type: 'object',
      title: 'Node',
      properties: {
        label: { type: 'string', title: 'Label' },
        children: { type: 'array', title: 'Children', items: { $ref: '#/$defs/Node' } },
      },
    },
  },
  type: 'array',
  title: 'Menu',
  items: {
    type: 'object',
    title: 'Menu entry',
    properties: {
      'first-name': { type: 'string', title: 'First name' },
      tree: { $ref: '#/$defs/Node' },
      extra: { type: 'object', title: 'Extra', properties: {} },
      missing: { $ref: '#/$defs/Missing' },
      metadata: { type: 'string', title: 'Reserved' },
      matrix: {
        type: 'array',
        title: 'Matrix',
        items: { type: 'array', title: 'Row', items: { type: 'number', title: 'Cell' } },
      },
      unknown: { title: 'No type' },
    },
  },
};
