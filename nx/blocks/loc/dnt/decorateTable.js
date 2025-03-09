function evaluateConditions(conditions, row, rowIndex) {
  // If any condition has a row and the rowIndex is not in the row
  // return false as conditions are row restricted
  if (conditions.some((c) => c.row && !c.row.includes(rowIndex))) {
    return { matches: false };
  }

  let matches = false;
  const matchedIndices = []; // Array to store matched indices

  const operatorChecks = {
    is: (text, value) => text === value,
    startswith: (text, value) => text.startsWith(value),
    contains: (text, value) => text.includes(value),
    'has-element': (text, value, cell) => cell.querySelector(value),
  };

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
          // Check if operator matches condition and update indices
          if (operatorChecks[condition.operator]?.(cellText, value, cell)) {
            matches = true;
            matchedIndices.push({ r: rowIndex, c: colIndex });
          }
        });
      }
    });
  });

  return { matches, matchedIndices };
}

function setDntRow(row) {
  const cells = Array.from(row.children);
  if (cells.every((cell) => cell.getAttribute('translate') === 'no')) {
    row.setAttribute('translate', 'no');
    cells.forEach((cell) => cell.removeAttribute('translate'));
  }
}

function convertNegativeIndexs(arr, len) {
  return arr.map((idx) => (idx < 0 ? len + idx : idx));
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
      target.range = convertNegativeIndexs(target.range, rows.length);

      if (target.range.includes(rowIndex) !== translate) {
        // if row is in range and we should not translate
        row.setAttribute('translate', 'no');
      }
      return;
    }

    rule.conditions.forEach((c) => {
      if (c.row) {
        c.row = convertNegativeIndexs(c.row, rows.length);
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

        // Sets translate='no' when:
        // condition matches: mark cells where translation status differs from targeting
        // condition doesn't match: mark cells when in translate mode
        if (condition.matches ? (translate !== isTargeted) : translate) {
          cell.setAttribute('translate', 'no');
        }
      });

      setDntRow(row);
      return;
    }

    // Process column-based rules
    // target.type is 'col' since 'row' is already handled above
    if (condition.matches) {
      target.range = convertNegativeIndexs(target.range, cells.length);

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

    setDntRow(row);
  });
}
