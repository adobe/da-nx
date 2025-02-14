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
        type: 'if',
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
        {
          type: 'if',
          row: [2],
        },
        {
          type: 'if',
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
        {
          type: 'if',
          row: [3, 4, 5],
        },
        {
          type: 'if',
          column: 1,
          operator: 'is',
          values: ['world'],
        },
      ],
    };

    const result = parseQuery('row 4-6 if column 2 equals "World" translate col 5');
    expect(result).to.deep.equal(expected);
  });

  it('should parse query that has multiple conditions', () => {
    const expected = {
      action: 'dnt',
      targets: [{ type: 'col', range: [1] }],
      conditions: [
        {
          type: 'if',
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

    result = parseQuery('dnt row 2-3 col 2 row 3 col 1');
    expect(result).to.deep.equal(expected);
  });
});
