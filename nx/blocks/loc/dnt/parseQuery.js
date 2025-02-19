const TOKENS = {
  DIRECTIVES: ['translate', 'dnt'],
  OPERATORS: ['is', 'not-is', 'startswith', 'contains', 'has-element', 'not-startswith', 'not-contains', 'not-has-element'],
  TARGETS: ['row', 'col', 'cell'],
};

const ALIASES = {
  ',': '',
  all: '',
  always: '',
  beginswith: 'startswith',
  column: 'col',
  columns: 'col',
  cols: 'col',
  equals: 'is',
  has: 'contains',
  hasel: 'has-element',
  haselement: 'has-element',
  includesel: 'has-element',
  containsel: 'has-element',
  includes: 'contains',
  or: '',
  rows: 'row',
  that: '',
};

const HAS_DIGITS = /^-?\d+|\*$/;

const replaceSequences = (arr) => {
  const replacements = [
    { target: ['do', 'not', 'translate'], replacement: 'dnt' },
    { target: ['does', 'not', 'equal'], replacement: 'not-is' },
    { target: ['does', 'not', 'startwith'], replacement: 'not-startswith' },
    { target: ['starts', 'with'], replacement: 'startswith' },
    { target: ['does', 'not', 'contain'], replacement: 'not-contains' },
    { target: ['does', 'not', 'have', 'element'], replacement: 'not-has-element' },
    { target: ['is', 'not', 'equal', 'to'], replacement: 'not-is' },
    { target: ['is', 'not'], replacement: 'not-is' },
    { target: ['any', 'col'], replacement: ['col', '*'] },
    { target: ['any', 'row'], replacement: ['row', '*'] },
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

function rearrangeTokens(tokens, indexAfterRowAsTarget) {
  const ifIndex = tokens.findIndex((t) => (t === 'if' || t === 'unless'));

  if (ifIndex === -1 || ifIndex === 0 || tokens[indexAfterRowAsTarget] === 'if' || tokens[indexAfterRowAsTarget] === 'unless') {
    return tokens;
  }

  // Extract the different parts
  const preRowTarket = tokens.slice(0, indexAfterRowAsTarget);
  const preIf = tokens.slice(indexAfterRowAsTarget, ifIndex);
  const rest = tokens.slice(ifIndex);

  return [...preRowTarket, ...rest, ...preIf];
}

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
  tokens = tokens.map((token) => ALIASES[token] ?? token);
  tokens = replaceSequences(tokens);

  return tokens.filter(Boolean);
}

function parseRangeToken(token) {
  if (token === '*') return '*';

  if (token.startsWith('-')) {
    // negative index is not zero based
    return [parseInt(token, 10)];
  }

  if (token.includes('-')) {
    const [start, end] = token.split('-').map((num) => parseInt(num, 10) - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  return [parseInt(token, 10) - 1];
}

/**
 * Parses a range token (e.g., "1-4", "2,3,5", "2")
 * Converts to zero-based index
 * @param {string} range - The range string to parse
 * @returns {number[]} Array of numbers in the range
 */
function parseRange(tokens, startIndex) {
  let indices = [];

  let i = startIndex;

  while (i < tokens.length && HAS_DIGITS.test(tokens[i])) {
    indices = [...indices, ...parseRangeToken(tokens[i])];
    i += 1;
  }
  return { indices, nextIndex: i };
}

/**
 * Creates a condition object from tokens
 * @param {string[]} tokens - Array of tokens
 * @param {number} startIndex - Starting index in tokens array
 * @returns {Object} Condition object and next token index
 */
function parseCondition(tokens, startIndex) {
  const condition = {
    column: 0,
    values: [],
  };

  let i = startIndex;

  // Parse column reference
  // TODO: handle multiple columns or ranges?
  if (tokens[i] === 'col') {
    i += 1;
    // only use first token
    condition.column = parseRangeToken(tokens[i])?.[0];
    i += 1;
  }

  if (tokens[i] === 'cell') {
    condition.column = '*';
    i += 1;
  }

  if (TOKENS.OPERATORS.includes(tokens[i])) {
    if (tokens[i].startsWith('not-')) {
      condition.negate = true;
      tokens[i] = tokens[i].slice(4);
    }
    condition.operator = tokens[i];
    i += 1;
  }

  // Parse cell value
  if (i < tokens.length) {
    while (tokens[i]?.startsWith('"')) {
      condition.values.push(tokens[i].replaceAll('"', ''));
      i += 1;
    }
  }

  return { condition, nextIndex: i };
}

function parseTarget(tokens, startIndex) {
  let i = startIndex;
  const target = { type: null, indices: [] };

  if (tokens[i] === 'row' || tokens[i] === 'col') {
    target.type = tokens[i];
    i += 1;

    if (i < tokens.length) {
      const { indices, nextIndex } = parseRange(tokens, i);
      target.indices = indices;
      i = nextIndex;
    }
  } else if (tokens[i] === 'cell') {
    target.type = 'cell';
    i += 1;
    if (i < tokens.length && HAS_DIGITS.test(tokens[i])) {
      target.rowIndex = Number(tokens[i]);
      i += 1;
      if (i < tokens.length && HAS_DIGITS.test(tokens[i])) {
        target.columnIndex = Number(tokens[i]);
        i += 1;
      }
    }
  }

  return { target, nextIndex: i };
}

function hasRowAsTarget(tokens) {
  if (tokens[0] !== 'row') {
    return 0;
  }

  let index = 1;

  if (TOKENS.DIRECTIVES.includes(tokens[index])
    && tokens[index + 1] === 'cell') {
    return 0;
  }

  while (index < tokens.length) {
    const token = tokens[index];

    if (TOKENS.OPERATORS.includes(token) || token === 'if') {
      return index;
    }

    if (TOKENS.DIRECTIVES.includes(token)) {
      if (tokens.includes('if')) {
        return index;
      }
      return 0;
    }

    index += 1;
  }
  return index;
}

function consolidateTargets(targets) {
  if (!targets?.length) {
    return [];
  }

  const cellRanges = [];
  const consolidatedTargets = [];

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

  return consolidatedTargets.length
    ? consolidatedTargets
    : targets;
}

/**
 * Parses a query string and returns a rule object
 * @param {string} query - The query string to parse
 * @returns {Object} Rule object describing the translation rules
 */
export default function parseQuery(query) {
  const queryStr = query.trim().toLowerCase();
  let tokens = tokenizeQuery(queryStr);
  const rule = {
    action: 'translate',
    targets: [],
    conditions: [],
  };

  if (tokens.length === 1) {
    if (tokens[0] === 'dnt') {
      rule.action = 'dnt';
    }
    return rule;
  }

  // 'row' at the start of the query
  // limits the scope of the query to the specified row(s)
  const indexAfterRowAsTarget = hasRowAsTarget(tokens);
  tokens = rearrangeTokens(tokens, indexAfterRowAsTarget);

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (i === 0 && indexAfterRowAsTarget) {
      const { target, nextIndex } = parseTarget(tokens, i);
      if (target.indices.length) {
        const row = [];
        target.indices.forEach((index) => row.push(index));
        rule.conditions.push({ row });
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
          type: target.type,
          range: target.indices,
        });
      }
      i = nextIndex;
    } else if (TOKENS.OPERATORS.includes(token)) {
      const { condition, nextIndex } = parseCondition(tokens, i);
      if (condition.columnIndex !== undefined) {
        rule.conditions.push(condition);
      }
      i = nextIndex;
    } else if (token === 'if' || token === 'unless') {
      // "if" is always followed by a target
      if (tokens[i + 1] === 'cell') {
        rule.targets.push({
          type: 'cell',
          range: [],
        });
      }

      const { condition, nextIndex } = parseCondition(tokens, i + 1);
      if (token === 'unless') {
        condition.negate = true;
      }
      rule.conditions.push(condition);

      i = nextIndex;
    } else {
      i += 1;
    }
  }

  if (rule.targets.length === 0) {
    // default target is all rows that match the conditions
    rule.targets.push({ type: 'row', range: [] });
  }

  rule.targets = consolidateTargets(rule.targets);

  // DEBUG
  // console.log(JSON.stringify(rule, null, 2));
  return rule;
}
