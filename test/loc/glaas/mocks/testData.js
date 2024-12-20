export const singleSheetJson = {
  ':type': 'sheet',
  total: '100',
  offset: '0',
  limit: '10',
  data: [
    { key1: 'value1', key2: 'value2' },
    { key1: 'value3', key2: 'value4' },
  ],
};

export const multiSheetJson = {
  data: {
    total: 2,
    limit: 2,
    offset: 0,
    data: [
      {
        key: 'hello',
        val: 'world',
        'no-translate': 'still in english',
        translate: 'back to',
      },
      {
        key: 'use',
        val: 'firefly',
        'no-translate': 'inside this column',
        translate: 'translating here',
      },
    ],
    ':colWidths': [50, 98, 227, 174],
  },
  dnt: {
    total: 1,
    limit: 1,
    offset: 0,
    data: [
      {
        'dnt-sheet': 'no-dnt-for-me',
        'dnt-columns': 'no-translate',
      },
    ],
    ':colWidths': [114, 125],
  },
  'no-dnt-for-me': {
    total: 3,
    limit: 3,
    offset: 0,
    data: [
      {
        mykey: 'this',
        myval: 'sheet',
      },
      {
        mykey: 'will',
        myval: 'not',
      },
      {
        mykey: 'be',
        myval: 'translated',
      },
    ],
    ':colWidths': [136, 134],
  },
  ':names': ['data', 'dnt', 'no-dnt-for-me'],
  ':version': 3,
  ':type': 'multi-sheet',
};
