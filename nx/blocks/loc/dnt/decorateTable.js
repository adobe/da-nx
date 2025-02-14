function evaluateConditions(conditions, row) {
  let matches = false;
  conditions.forEach((condition) => {
    const conditionCell = row.children[condition.column];
    const cellText = conditionCell?.textContent.toLowerCase() || '';

    condition.values.forEach((v) => {
      const value = v.toLowerCase();
      switch (condition.operator) {
        case 'is':
          matches = matches || cellText === value;
          break;
        case 'startswith':
          matches = matches || cellText.startsWith(value);
          break;
        case 'contains':
          matches = matches || cellText.includes(value);
          break;
        default:
          break;
      }
    });

    if (condition.type === 'unless' || condition.type === 'if not') {
      matches = !matches;
    }
  });

  return matches;
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

  const translate = rule.action === 'translate';

  const target = rule.targets[0];

  // Special case for when rows are specified at the start of the query
  const validRowIndices = [];

  if (rule.conditions[0]?.type === 'if' && rule.conditions[0]?.row?.length) {
    validRowIndices.push(...rule.conditions[0].row);
    rule.conditions.shift();
  }

  // Process row-based rules
  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.children);

    if (validRowIndices.length && !validRowIndices.includes(rowIndex)) {
      if (translate) {
        // if user is specifying translate,
        // then we should not translate rows that are not in the validRowIndices
        row.setAttribute('translate', 'no');
      }
      return;
    }

    if (target.type === 'row') {
      if (target.range.includes(rowIndex) !== translate) {
        // if row is in range and we should not translate
        row.setAttribute('translate', 'no');
      }
      return;
    }

    const shouldApplyRule = rule.conditions.length
      ? evaluateConditions(rule.conditions, row, rowIndex)
      : true;

    // Handle cell targets
    if (target.type === 'cell') {
      const targetCells = new Set(target.range.map(({ r, c }) => `${r}-${c}`));

      let translatedCellCount = 0;
      cells.forEach((cell, colIndex) => {
        const cellKey = `${rowIndex}-${colIndex}`;
        const isTargeted = targetCells.has(cellKey);

        if (translate !== isTargeted && shouldApplyRule) {
          cell.setAttribute('translate', 'no');
          translatedCellCount += 1;
        } else if (translate && !shouldApplyRule) {
          cell.setAttribute('translate', 'no');
          translatedCellCount += 1;
        }
      });

      if (translatedCellCount === cells.length) {
        // if all cells in the row are dnt, then apply to the row instead
        row.setAttribute('translate', 'no');
        cells.forEach((cell) => cell.removeAttribute('translate'));
      }
      return;
    }

    // Process column-based rules
    // target.type is 'col' since 'row' is already handled above

    if (shouldApplyRule) {
      cells.forEach((cell, colIndex) => {
        if (target.range.includes(colIndex) !== translate) {
          cell.setAttribute('translate', 'no');
        }
      });
    } else if (translate) {
      // Since the action is 'translate'
      // it implies that anything that does not match the conditions should not be translated
      row.setAttribute('translate', 'no');
    }
  });

  // DEBUG
  // console.log(JSON.stringify(rule, null, 2));
  // // eslint-disable-next-line no-use-before-define
  // console.log(prettyPrintNode(table));
  // console.log('--------------------------------');
}

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
