const TOKENS = {
  DIRECTIVES: ['translate', 'dnt'],
  OPERATORS: ['if', 'unless', 'is', 'is not', 'startswith', 'contains'],
  TARGETS: ['row', 'col', 'columns', 'rows', 'other', 'all'],
};

const ALIASES = {
  always: '',
  all: '',
  beginswith: 'startswith',
  column: 'col',
  columns: 'col',
  has: 'contains',
  includes: 'contains',
  'do not translate': 'dnt',
  'does not equal': 'is not',
  equals: 'is',
  rows: 'row',
  ',': '',
  or: '',
};

/**
 * Checks for specific sequences in the array and replaces them with designated values.
 * @param {Array} arr - The array to check.
 * @returns {Array} - The modified array with specified sequences replaced.
 */
const replaceSequences = (arr) => {
  const replacements = [
    { target: ['do', 'not', 'translate'], replacement: 'dnt' },
    { target: ['does', 'not', 'equal'], replacement: ['is', 'not'] },
  ];

  const result = [...arr]; // Create a copy of the original array

  replacements.forEach(({ target, replacement }) => {
    const indices = [];

    // Find indices of the target values in order
    result.forEach((value, i) => {
      if (value === target[indices.length]) {
        indices.push(i);
      }
    });

    // Check if we found all target values in order
    if (indices.length === target.length) {
      const startIndex = indices[0];
      const endIndex = startIndex + target.length;

      if (endIndex <= result.length) {
        // Replace the target values with the specified replacement
        result.splice(
          startIndex,
          target.length,
          ...(Array.isArray(replacement) ? replacement : [replacement]),
        );
      }
    }
  });
  return result;
};

/**
 * Tokenizes a query string into an array of tokens
 * @param {string} query - The query string to tokenize
 * @returns {string[]} Array of tokens
 */
function tokenizeQuery(query) {
  let tokens = [];
  let currentToken = '';
  let inQuotes = false;

  for (let i = 0; i < query.length; i += 1) {
    const char = query[i];

    if (char === '"') {
      if (inQuotes) {
        tokens.push(`"${currentToken}"`);
        currentToken = '';
      }
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      currentToken += char;
    } else if (char === ' ' || char === ',') {
      if (currentToken) {
        tokens.push(currentToken.toLowerCase());
        currentToken = '';
      }
    } else {
      currentToken += char;
    }
  }

  if (currentToken) {
    tokens.push(currentToken.toLowerCase());
  }

  tokens = replaceSequences(tokens);
  return tokens
    .map((token) => ALIASES[token] ?? token)
    .filter(Boolean);
}

/**
 * Parses a range token (e.g., "1-4", "2,3,5", "2")
 * Converts to zero-based index
 * @param {string} range - The range string to parse
 * @returns {number[]} Array of numbers in the range
 */
function parseRange(range) {
  if (range === 'all' || range === 'any') {
    return null;
  }

  if (range.includes('-')) {
    const [start, end] = range.split('-').map((num) => parseInt(num, 10) - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  if (range.includes(',')) {
    return range.split(',').map((num) => parseInt(num, 10) - 1);
  }

  return [parseInt(range, 10) - 1];
}

/**
 * Creates a condition object from tokens
 * @param {string[]} tokens - Array of tokens
 * @param {number} startIndex - Starting index in tokens array
 * @returns {Object} Condition object and next token index
 */
function parseCondition(tokens, startIndex) {
  const condition = {
    type: null,
    columnIndex: 0,
    values: [],
  };

  let i = startIndex;

  // Skip 'if', 'when', etc.
  if (TOKENS.OPERATORS.includes(tokens[i])) {
    condition.type = tokens[i];
    i += 1;
  }

  // Parse column reference
  // TODO: handle multiple columns or ranges
  if (tokens[i] === 'col') {
    i += 1;
    condition.columnIndex = Number(tokens[i]) - 1;
    i += 1;
  }

  // Parse operator
  if (TOKENS.OPERATORS.includes(tokens[i])) {
    condition.operator = tokens[i];
    i += 1;
  }

  // Parse value
  if (i < tokens.length) {
    while (tokens[i]?.startsWith('"')) {
      condition.values.push(tokens[i].replaceAll('"', ''));
      i += 1;
    }
  }

  return { condition, nextIndex: i };
}

/**
 * Parses a target specification
 * @param {string[]} tokens - Array of tokens
 * @param {number} startIndex - Starting index in tokens array
 * @returns {Object} Target object and next token index
 */
function parseTarget(tokens, startIndex) {
  let i = startIndex;
  const target = { type: null, indices: [] };

  if (tokens[i] === 'row' || tokens[i] === 'col') {
    target.type = tokens[i];
    i += 1;

    if (i < tokens.length) {
      if (/^\d/.test(tokens[i])) {
        while (i < tokens.length && /^\d/.test(tokens[i])) {
          // target.indices.push(parseRange(tokens[i]));
          target.indices = [...target.indices, ...parseRange(tokens[i])];
          i += 1;
        }
      }
    }
  } else if (tokens[i] === 'cell') {
    target.type = 'cell';
    i += 1;
    if (i < tokens.length) {
      target.rowIndex = Number(tokens[i]);
      i += 1;
      if (i < tokens.length) {
        target.columnIndex = Number(tokens[i]);
        i += 1;
      }
    }
  }

  return { target, nextIndex: i };
}

function isNextTokenDirective(tokens, index) {
  let currentIndex = index;
  while (currentIndex < tokens.length) {
    const token = tokens[currentIndex];

    // if (TOKENS.OPERATORS.includes(token) || TOKENS.TARGETS.includes(token)) {
    if (TOKENS.OPERATORS.includes(token)) {
      return false;
    }

    if (TOKENS.DIRECTIVES.includes(token)) {
      return true;
    }

    currentIndex += 1;
  }
  return false;
}

function consolidateTargets(targets) {
  if (!targets?.length) {
    return [];
  }

  const consolidatedTargets = [];
  const cellRanges = [];

  for (let i = 0; i < targets.length; i += 1) {
    const currentTarget = targets[i];
    const nextTarget = targets[i + 1];

    if (currentTarget.type === 'row' && nextTarget?.type === 'col') {
      // Create cell coordinates from row and col ranges
      currentTarget.range.forEach((row) => {
        nextTarget.range.forEach((col) => {
          cellRanges.push({ r: row, c: col });
        });
      });
      i += 1; // Skip the next target since we used it
    } else if (currentTarget.type === 'cell') {
      cellRanges.push(...currentTarget.range);
    } else {
      consolidatedTargets.push(currentTarget);
    }
  }

  // Add combined cell target if any cell coordinates exist
  if (cellRanges.length) {
    consolidatedTargets.push({ type: 'cell', range: cellRanges });
  }

  return consolidatedTargets;
}

/**
 * Parses a query string and returns a rule object
 * @param {string} query - The query string to parse
 * @returns {Object} Rule object describing the translation rules
 */
export default function parseQuery(query) {
  const queryStr = query.trim().toLowerCase();
  const tokens = tokenizeQuery(queryStr);
  const rule = {
    action: 'translate',
    targets: [],
    conditions: [],
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // 'row' at the start of the query
    // limits the scope of the query to the specified row(s)
    if (i === 0 && token === 'row' && !isNextTokenDirective(tokens, i + 1)) {
      const { target, nextIndex } = parseTarget(tokens, i);
      if (target.indices.length) {
        const row = [];
        target.indices.forEach((index) => row.push(index));
        rule.conditions.push({
          type: 'if',
          row,
        });
      }
      i = nextIndex;
    } else if (TOKENS.DIRECTIVES.includes(token)) {
      if (token === 'dnt') {
        rule.action = 'dnt';
      }
      i += 1;
    } else if (TOKENS.TARGETS.includes(token)) {
      const { target, nextIndex } = parseTarget(tokens, i);
      if (target.indices) {
        rule.targets.push({
          type: target.type === 'columns' ? 'column' : target.type,
          range: target.indices,
        });
      }
      i = nextIndex;
    } else if (TOKENS.OPERATORS.includes(token)) {
      const { condition, nextIndex } = parseCondition(tokens, i);
      if (condition.columnIndex !== undefined) {
        rule.conditions.push({
          type: condition.type,
          column: condition.columnIndex,
          operator: condition.operator,
          values: condition.values,
        });
      }
      i = nextIndex;
    } else {
      i += 1;
    }
  }

  rule.targets = consolidateTargets(rule.targets);

  // console.log(JSON.stringify(rule, null, 2));
  return rule;
}
