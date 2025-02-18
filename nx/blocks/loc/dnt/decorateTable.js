function evaluateConditions(conditions, row, rowIndex) {
  // If any condition has a row and the rowIndex is not in the row
  // return false as conditions are row restricted
  if (conditions.some((c) => c.row && !c.row.includes(rowIndex))) {
    return { matches: false };
  }

  let matches = false;
  const matchedIndices = []; // Array to store matched indices

  conditions.forEach((condition) => {
    // Convert negative column indices to positive by counting from end
    if (typeof condition.column === 'number' && condition.column < 0) {
      condition.column = row.children.length + condition.column;
    }
    [...row.children].forEach((cell, colIndex) => {
      if (condition.column === '*' || condition.column === colIndex) {
        const cellText = cell.textContent.toLowerCase() || '';
        condition.values?.forEach((v) => {
          const value = v.toLowerCase();
          switch (condition.operator) {
            case 'is':
              if (cellText === value) {
                matches = true;
                matchedIndices.push({ r: rowIndex, c: colIndex });
              }
              break;
            case 'startswith':
              if (cellText.startsWith(value)) {
                matches = true;
                matchedIndices.push({ r: rowIndex, c: colIndex });
              }
              break;
            case 'contains':
              if (cellText.includes(value)) {
                matches = true;
                matchedIndices.push({ r: rowIndex, c: colIndex });
              }
              break;
            case 'has-element':
              if (cell.querySelector(value)) {
                matches = true;
                matchedIndices.push({ r: rowIndex, c: colIndex });
              }
              break;
            /* c8 ignore next 2 */
            default:
              break;
          }
        });
      }
    });
  });

  return { matches, matchedIndices }; // Return both matches and matchedIndices
}

function checkForAllDntCells(row) {
  const cells = Array.from(row.children);
  if (cells.every((cell) => cell.getAttribute('translate') === 'no')) {
    row.setAttribute('translate', 'no');
    cells.forEach((cell) => cell.removeAttribute('translate'));
  }
}

/**
 * Decorates a table based on translation rules
 * @param {HTMLElement} table - The table element to decorate
 * @param {Object} rule - The rule object from parseQuery
 */
export default function decorateTable(table, rule) {
  const rows = Array.from(table.children);

  // If no specific targets and DNT, mark whole table
  // If only 'translate' action, do nothing
  if (rule.targets.length === 0 && rule.conditions.length === 0) {
    if (rule.action === 'dnt') {
      table.setAttribute('translate', 'no');
    }
    return;
  }

  let translate = rule.action === 'translate';
  if (rule.conditions.some((c) => c.negate)) {
    translate = !translate;
  }

  const target = rule.targets[0];
  if (!target) {
    console.log('DNT Error: No target found');
    return;
  }

  const targetMatchingCells = target.type === 'cell' && target.range.length === 0;

  // Process row-based rules
  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.children);

    if (target.type === 'row' && target.range.length > 0) {
      // Convert negative row indices to positive by counting from end
      target.range = target.range
        .map((idx) => (idx < 0 ? rows.length + idx : idx));

      if (target.range.includes(rowIndex) !== translate) {
        // if row is in range and we should not translate
        row.setAttribute('translate', 'no');
      }
      return;
    }

    rule.conditions.forEach((c) => {
      if (c.row) {
        c.row = c.row
          .map((idx) => (idx < 0 ? rows.length + idx : idx));
      }
    });

    const condition = rule.conditions.length
      ? evaluateConditions(rule.conditions, row, rowIndex)
      : { matches: true };

    // Handle cell targets
    if (target.type === 'cell') {
      if (targetMatchingCells && condition.matches) {
        target.range = [...target.range, ...condition.matchedIndices];
      }

      const targetCells = new Set(target.range.map(({ r, c }) => `${r}-${c}`));

      cells.forEach((cell, colIndex) => {
        const cellKey = `${rowIndex}-${colIndex}`;
        const isTargeted = targetCells.has(cellKey);

        if (translate !== isTargeted && condition.matches) {
          cell.setAttribute('translate', 'no');
        } else if (translate && !condition.matches) {
          cell.setAttribute('translate', 'no');
        }
      });

      checkForAllDntCells(row);
      return;
    }

    // Process column-based rules
    // target.type is 'col' since 'row' is already handled above

    if (condition.matches) {
      // Convert negative column indices to positive by counting from end
      target.range = target.range
        .map((idx) => (idx < 0 ? cells.length + idx : idx));

      cells.forEach((cell, colIndex) => {
        // If target.range is empty then it applies to all columns
        if (
          (target.range.includes(colIndex) !== translate)
          || (target.range.length === 0 && !translate)
        ) {
          cell.setAttribute('translate', 'no');
        }
      });
    } else if (translate) {
      // Since the action is 'translate' it implies that anything
      // that does not match the conditions should not be translated
      row.setAttribute('translate', 'no');
    }

    checkForAllDntCells(row);
  });

  // DEBUG
  // console.log(JSON.stringify(rule, null, 2));
  // // eslint-disable-next-line no-use-before-define
  // console.log(prettyPrintNode(table));
}

/* c8 ignore start */
// Helper function to pretty print with indentation
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
