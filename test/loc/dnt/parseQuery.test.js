import { expect } from '@esm-bundle/chai';
import parseQuery from '../../../nx/blocks/loc/dnt/parseQuery.js';

describe('parseQuery', () => {
  it('should parse simple translate directive', () => {
    const result = parseQuery('translate');
    expect(result).to.deep.equal({
      action: 'translate',
      targets: [],
      conditions: [],
    });
  });

  it('should parse simple do not translate directive', () => {
    const dntTable = {
      action: 'dnt',
      targets: [],
      conditions: [],
    };
    let result = parseQuery('do not   translate');
    expect(result).to.deep.equal(dntTable);
    result = parseQuery('dnt');
    expect(result).to.deep.equal(dntTable);
    result = parseQuery('dnt all');
    expect(result).to.deep.equal(dntTable);
  });

  it('should parse row target', () => {
    const expected = {
      action: 'translate',
      targets: [{ type: 'row', range: [0, 2, 3] }],
      conditions: [],
    };
    let result = parseQuery('translate row 1 3 4');
    expect(result).to.deep.equal(expected);

    result = parseQuery('row 1 3 4 translate');
    expect(result).to.deep.equal(expected);
  });

  it('should parse column target', () => {
    const result = parseQuery('dnt col 2');
    expect(result).to.deep.equal({
      action: 'dnt',
      targets: [{ type: 'col', range: [1] }],
      conditions: [],
    });
  });

  it('should parse column target with multiple columns', () => {
    const multiColumnResult = {
      action: 'dnt',
      targets: [{ type: 'col', range: [1, 4, 7] }],
      conditions: [],
    };
    let result = parseQuery('dnt col 2 5 8');
    expect(result).to.deep.equal(multiColumnResult);
    result = parseQuery('dnt col 2,5,8');
    expect(result).to.deep.equal(multiColumnResult);

    result = parseQuery('dnt col 2,5-8');
    expect(result).to.deep.equal({
      action: 'dnt',
      targets: [{ type: 'col', range: [1, 4, 5, 6, 7] }],
      conditions: [],
    });
  });

  it('should parse range target', () => {
    let result = parseQuery('translate col 1-3');
    expect(result).to.deep.equal({
      action: 'translate',
      targets: [{ type: 'col', range: [0, 1, 2] }],
      conditions: [],
    });

    result = parseQuery('translate col 7-11');
    expect(result).to.deep.equal({
      action: 'translate',
      targets: [{ type: 'col', range: [6, 7, 8, 9, 10] }],
      conditions: [],
    });
  });

  it('should parse condition', () => {
    const expected = {
      action: 'translate',
      targets: [{ type: 'col', range: [1] }],
      conditions: [{
        column: 0,
        operator: 'is',
        values: ['hello'],
      }],
    };

    let result = parseQuery('translate col 2 if col 1 equals "Hello"');
    expect(result).to.deep.equal(expected);
    result = parseQuery('if col 1 is "Hello" translate col 2');
    expect(result).to.deep.equal(expected);
  });

  it('should parse condition that targets a specific row', () => {
    const expected = {
      action: 'translate',
      targets: [{ type: 'col', range: [1] }],
      conditions: [
        // TODO double check this first obj
        { row: [2] },
        {
          column: 0,
          operator: 'is',
          values: ['hello'],
        },
      ],
    };

    const result = parseQuery('row 3 if col 1 is "Hello" translate col 2');
    expect(result).to.deep.equal(expected);
  });

  it('should parse condition that targets multiple rows', () => {
    const expected = {
      action: 'translate',
      targets: [{ type: 'col', range: [4] }],
      conditions: [
        { row: [3, 4, 5] },
        {
          column: 1,
          operator: 'is',
          values: ['world'],
        },
      ],
    };

    const result = parseQuery('rows 4-6 if column 2 equals "World" translate col 5');
    expect(result).to.deep.equal(expected);
  });

  it('should parse query that has multiple conditions', () => {
    const expected = {
      action: 'dnt',
      targets: [{ type: 'col', range: [1] }],
      conditions: [
        {
          column: 0,
          operator: 'is',
          values: ['not there', 'row 2 col 1'],
        },
      ],
    };

    let result = parseQuery('dnt col 2 if col 1 equals "not there" "row 2 col 1"');
    expect(result).to.deep.equal(expected);

    result = parseQuery('if col 1 equals "not there" or "row 2 col 1" dnt col 2');
    expect(result).to.deep.equal(expected);
  });

  it('should parse query that targets a cell', () => {
    const expected = {
      action: 'dnt',
      targets: [{
        type: 'cell',
        range: [{ r: 1, c: 1 }, { r: 2, c: 1 }, { r: 2, c: 0 }],
      }],
      conditions: [],
    };

    let result = parseQuery('row 2-3 col 2 row 3 col 1 dnt');
    expect(result).to.deep.equal(expected);

    result = parseQuery('dnt row 2-3 col 2, row 3 col 1');
    expect(result).to.deep.equal(expected);
  });

  it('if any col equals "Dark Alley" or "DA" then dnt that row', () => {
    const expected = {
      action: 'dnt',
      targets: [
        {
          type: 'row',
          range: [],
        },
      ],
      conditions: [
        {
          column: '*',
          values: [
            'dark alley',
            'da',
          ],
          operator: 'is',
        },
      ],
    };

    let result = parseQuery('if any col equals "Dark Alley" or "DA" then dnt that row');
    expect(result).to.deep.equal(expected);

    result = parseQuery('dnt row if any col equals "Dark Alley" or "DA"');
    expect(result).to.deep.equal(expected);

    result = parseQuery('if col * equals "Dark Alley" or "DA" then dnt row');
    expect(result).to.deep.equal(expected);

    result = parseQuery('dnt row if col * equals "Dark Alley" "DA"');
    expect(result).to.deep.equal(expected);
  });

  it('negative target column index', () => {
    const expected = {
      action: 'translate',
      targets: [
        {
          type: 'col',
          range: [-2],
        },
      ],
      conditions: [
        {
          column: 0,
          values: [
            'hello',
          ],
          operator: 'is',
        },
      ],
    };

    let result = parseQuery('translate col -2 if col 1 equals "Hello"');
    expect(result).to.deep.equal(expected);

    result = parseQuery('if col 1 equals "Hello" translate col -2');
    expect(result).to.deep.equal(expected);
  });

  it('negative target row index', () => {
    const expected = {
      action: 'translate',
      targets: [
        {
          type: 'row',
          range: [-2],
        },
      ],
      conditions: [
        {
          column: 0,
          values: [
            'hello',
          ],
          operator: 'is',
        },
      ],
    };

    let result = parseQuery('translate row -2 if col 1 equals "Hello"');
    expect(result).to.deep.equal(expected);

    result = parseQuery('if col 1 equals "Hello" translate row -2');
    expect(result).to.deep.equal(expected);
  });

  it('negative condition column index', () => {
    const expected = {
      action: 'translate',
      targets: [
        {
          type: 'row',
          range: [-2],
        },
      ],
      conditions: [
        {
          column: -1,
          values: [
            'hello',
          ],
          operator: 'is',
        },
      ],
    };

    let result = parseQuery('translate row -2 if col -1 equals "Hello"');
    expect(result).to.deep.equal(expected);

    result = parseQuery('if col -1 equals "Hello" translate row -2');
    expect(result).to.deep.equal(expected);
  });

  it('target a cell', () => {
    const expected = {
      action: 'dnt',
      targets: [{
        type: 'cell',
        range: [],
      }],
      conditions: [
        {
          row: [
            0,
          ],
        },
        {
          column: '*',
          values: [
            'dark',
          ],
          operator: 'startswith',
        },
      ],
    };

    let result = parseQuery('row 1 if any col beginsWith "dark" then dnt that cell');
    expect(result).to.deep.equal(expected);

    result = parseQuery('row 1 dnt cell if any col beginsWith "dark"');
    expect(result).to.deep.equal(expected);
  });

  it('row 2-4 translate col 3 if column 1 startswith "row"', () => {
    const expected = {
      action: 'translate',
      targets: [{
        type: 'col',
        range: [2],
      }],
      conditions: [
        { row: [1, 2, 3] },
        {
          column: 0,
          values: [
            'row',
          ],
          operator: 'startswith',
        },
      ],
    };

    let result = parseQuery('row 2-4 translate col 3 if column 1 startswith "row"');
    expect(result).to.deep.equal(expected);

    result = parseQuery('row 2-4 if column 1 startswith "row" translate col 3');
    expect(result).to.deep.equal(expected);
  });

  it('row 2-4 translate col 3 if column 1 startswith "row"', () => {
    const expected = {
      action: 'dnt',
      targets: [{
        type: 'cell',
        range: [],
      }],
      conditions: [
        {
          column: '*',
          values: ['img'],
          operator: 'has-element',
        },
      ],
    };

    let result = parseQuery('if any col hasEl "img" then dnt that cell');
    expect(result).to.deep.equal(expected);

    result = parseQuery('dnt cell if any col hasEl "img"');
    expect(result).to.deep.equal(expected);
  });

  it('dnt col 2 if col 1 is not "title" or "description"', () => {
    const expected = {
      action: 'dnt',
      targets: [{
        type: 'col',
        range: [1],
      }],
      conditions: [
        {
          column: 0,
          values: ['title', 'description'],
          operator: 'is',
          negate: true,
        },
      ],
    };

    let result = parseQuery('dnt col 2 if col 1 is not "title" or "description"');
    expect(result).to.deep.equal(expected);

    result = parseQuery('if col 1 is not "title" or "description" dnt col 2');
    expect(result).to.deep.equal(expected);

    result = parseQuery('dnt col 2 unless col 1 is "title" or "description"');
    expect(result).to.deep.equal(expected);
  });

  it('dnt col 2 if col 1 is not "title" or "description"', () => {
    const expected = {
      action: 'dnt',
      targets: [{
        type: 'row',
        range: [],
      }],
      conditions: [
        { row: [-2] },
        {
          column: '*',
          values: ['picture'],
          operator: 'has-element',
        },
      ],
    };

    let result = parseQuery('row -2 dnt if any column hasElement "picture"');
    expect(result).to.deep.equal(expected);

    // result = parseQuery('dnt row -2 if any col hasElement "picture"');
    // expect(result).to.deep.equal(expected);
  });

  it('if cell startswith "row 3 col 1" then dnt', () => {
    const expected = {
      action: 'dnt',
      targets: [{
        type: 'cell',
        range: [],
      }],
      conditions: [
        {
          column: '*',
          values: ['row 3 col 1'],
          operator: 'startswith',
        },
      ],
    };

    let result = parseQuery('if cell startswith "row 3 col 1" then dnt');
    expect(result).to.deep.equal(expected);

    result = parseQuery('dnt if cell startswith "row 3 col 1"');
    expect(result).to.deep.equal(expected);
  });
});
