import { expect } from '@esm-bundle/chai';
import decorateTable from '../../../nx/blocks/loc/dnt/decorateTable.js';
import parseQuery from '../../../nx/blocks/loc/dnt/parseQuery.js';

function prettyPrintNode(node, indent = 0) {
  let result = '';
  const indentString = '  '.repeat(indent);

  if (node.nodeType === Node.TEXT_NODE) {
    const textContent = node.textContent.trim();
    if (textContent) {
      result += `${indentString}${textContent}\n`;
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    result += `${indentString}<${node.nodeName.toLowerCase()}`;

    // Add attributes
    for (const attr of node.attributes) {
      result += ` ${attr.name}="${attr.value}"`;
    }
    result += '>\n';

    // Recursively process child nodes
    for (const child of node.childNodes) {
      result += prettyPrintNode(child, indent + 1);
    }

    result += `${indentString}</${node.nodeName.toLowerCase()}>\n`;
  }

  return result;
}

function createTableCell(text) {
  const cell = document.createElement('div');
  cell.textContent = text;
  return cell;
}

function createTable(rows = 2, cols = 3) {
  const table = document.createElement('div');
  table.className = 'columns';

  for (let i = 0; i < rows; i += 1) {
    const row = document.createElement('div');
    for (let j = 0; j < cols; j += 1) {
      row.appendChild(createTableCell(`row ${i + 1} col ${j + 1}`));
    }
    table.appendChild(row);
  }

  return table;
}

describe('decorateTable', () => {
  it('should decorate entire table for if only dnt or translate is specified', () => {
    const rule = parseQuery('do not translate');
    const table = createTable();
    decorateTable(table, rule);
    const result = table.getAttribute('translate');
    expect(result).to.equal('no');
  });

  it('dnt row 2: only dnt row 2', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div translate="no">
    <div>
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
</div>
`;
    const rule = parseQuery('row 2 dnt');
    const table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('translate row 2: should dnt all rows except row 2', () => {
    const expected = `<div class="columns">
  <div translate="no">
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div>
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
</div>
`;
    const rule = parseQuery('translate row 2');
    const table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('translate col 2: should dnt all columns except col 2', () => {
    const expected = `<div class="columns">
  <div>
    <div translate="no">
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div translate="no">
      row 1 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div translate="no">
      row 2 col 3
    </div>
  </div>
</div>
`;

    const rule = parseQuery('translate col 2');
    const table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('do not translate col 2: should dnt only col 2', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div translate="no">
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div>
      row 2 col 1
    </div>
    <div translate="no">
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
</div>
`;

    const rule = parseQuery('do not translate col 2');
    const table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('translate col 2 if col 1 equals "row 2 col 1"', () => {
    const expected = `<div class="columns">
  <div translate="no">
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div translate="no">
      row 2 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('translate col 2 if col 1 equals "row 2 col 1"');
    let table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('if col 1 is "row 2 col 1" translate col 2');
    table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('dnt col 2 if col 1 equals "row 2 col 1"', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div>
      row 2 col 1
    </div>
    <div translate="no">
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('dnt col 2 if col 1 equals "row 2 col 1"');
    let table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('if col 1 equals "row 2 col 1" dnt col 2');
    table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('dnt col 2 if col 1 equals "not there", "row 2 col 1"');
    table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('dnt col 2 if col 1 equals "not there" "row 2 col 1"', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div>
      row 2 col 1
    </div>
    <div translate="no">
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('dnt col 2 if col 1 equals "row 2 col 1"');
    let table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('if col 1 equals "row 2 col 1" dnt col 2');
    table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('row 2-4 if column 1 startswith "row 2" dnt col 3', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div>
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div translate="no">
      row 2 col 3
    </div>
  </div>
  <div>
    <div>
      row 3 col 1
    </div>
    <div>
      row 3 col 2
    </div>
    <div>
      row 3 col 3
    </div>
  </div>
  <div>
    <div>
      row 4 col 1
    </div>
    <div>
      row 4 col 2
    </div>
    <div>
      row 4 col 3
    </div>
  </div>
  <div>
    <div>
      row 5 col 1
    </div>
    <div>
      row 5 col 2
    </div>
    <div>
      row 5 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('row 2-4 if column 1 startswith "row 2" dnt col 3');
    let table = createTable(5, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('row 2-4 dnt col 3 if column 1 startswith "row 2"');
    table = createTable(5, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('row 2-4 if column 1 startswith "row" dnt col 3', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div>
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div translate="no">
      row 2 col 3
    </div>
  </div>
  <div>
    <div>
      row 3 col 1
    </div>
    <div>
      row 3 col 2
    </div>
    <div translate="no">
      row 3 col 3
    </div>
  </div>
  <div>
    <div>
      row 4 col 1
    </div>
    <div>
      row 4 col 2
    </div>
    <div translate="no">
      row 4 col 3
    </div>
  </div>
  <div>
    <div>
      row 5 col 1
    </div>
    <div>
      row 5 col 2
    </div>
    <div>
      row 5 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('row 2-4 if column 1 startswith "row" dnt col 3');
    let table = createTable(5, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('row 2-4 dnt col 3 if column 1 startswith "row"');
    table = createTable(5, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('row 2-4 if column 1 startswith "row" translate col 3', () => {
    const expected = `<div class="columns">
  <div translate="no">
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 2 col 1
    </div>
    <div translate="no">
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 3 col 1
    </div>
    <div translate="no">
      row 3 col 2
    </div>
    <div>
      row 3 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 4 col 1
    </div>
    <div translate="no">
      row 4 col 2
    </div>
    <div>
      row 4 col 3
    </div>
  </div>
  <div translate="no">
    <div>
      row 5 col 1
    </div>
    <div>
      row 5 col 2
    </div>
    <div>
      row 5 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('row 2-4 if column 1 startswith "row" translate col 3');
    let table = createTable(5, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('row 2-4 translate col 3 if column 1 startswith "row"');
    table = createTable(5, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('row 2-4 if column 1 startswith "row 3" translate col 3', () => {
    const expected = `<div class="columns">
  <div translate="no">
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div translate="no">
    <div>
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 3 col 1
    </div>
    <div translate="no">
      row 3 col 2
    </div>
    <div>
      row 3 col 3
    </div>
  </div>
  <div translate="no">
    <div>
      row 4 col 1
    </div>
    <div>
      row 4 col 2
    </div>
    <div>
      row 4 col 3
    </div>
  </div>
  <div translate="no">
    <div>
      row 5 col 1
    </div>
    <div>
      row 5 col 2
    </div>
    <div>
      row 5 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('row 2-4 if column 1 startswith "row 3" translate col 3');
    let table = createTable(5, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('row 2-4 translate col 3 if column 1 startswith "row 3"');
    table = createTable(5, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('multiple conditions', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div translate="no">
    <div>
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
</div>
`;
    const rule = parseQuery('dnt row 2');
    const table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('translate by itself', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div>
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
</div>
`;
    const rule = parseQuery('translate');
    const table = createTable();
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('target specific cells to dnt', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div>
      row 2 col 1
    </div>
    <div translate="no">
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 3 col 1
    </div>
    <div translate="no">
      row 3 col 2
    </div>
    <div>
      row 3 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('dnt row 2-3 col 2 row 3 col 1');
    let table = createTable(3, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('row 2-3 col 2 row 3 col 1 dnt');
    table = createTable(3, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });

  it('target specific cells to translate', () => {
    const expected = `<div class="columns">
  <div translate="no">
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div translate="no">
      row 2 col 3
    </div>
  </div>
  <div>
    <div>
      row 3 col 1
    </div>
    <div>
      row 3 col 2
    </div>
    <div translate="no">
      row 3 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('translate row 2-3 col 2 row 3 col 1');
    let table = createTable(3, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);

    rule = parseQuery('row 2-3 col 2 row 3 col 1 translate');
    table = createTable(3, 3);
    decorateTable(table, rule);
    expect(prettyPrintNode(table)).to.equal(expected);
  });
});

describe('multiple rules', () => {
  // NOTE: Only the dnt directive is supported when using multiple rules
  // Each rule is applied in order, and the dnt marked cells are cumulative
  it('can additively apply dnt rules', () => {
    const expected = `<div class="columns">
  <div>
    <div>
      row 1 col 1
    </div>
    <div>
      row 1 col 2
    </div>
    <div>
      row 1 col 3
    </div>
  </div>
  <div translate="no">
    <div>
      row 2 col 1
    </div>
    <div>
      row 2 col 2
    </div>
    <div>
      row 2 col 3
    </div>
  </div>
  <div>
    <div translate="no">
      row 3 col 1
    </div>
    <div translate="no">
      row 3 col 2
    </div>
    <div>
      row 3 col 3
    </div>
  </div>
</div>
`;
    let rule = parseQuery('dnt row 2');
    const table = createTable(3, 3);
    decorateTable(table, rule);
    rule = parseQuery('dnt row 3 col 2');
    decorateTable(table, rule);
    rule = parseQuery('row 3 dnt col 3 if col 1 equals "not there"');
    decorateTable(table, rule);
    rule = parseQuery('dnt row 3 col 1 if col 1 equals "row 3 col 1"');
    decorateTable(table, rule);

    expect(prettyPrintNode(table)).to.equal(expected);
  });
});
