const SEEDED_CREATED_AT = '2026-04-14T00:00:00.000Z';

function makeSeededTool(def) {
  return {
    status: 'draft',
    createdBy: 'model',
    createdAt: SEEDED_CREATED_AT,
    approvedBy: null,
    approvedAt: null,
    promotedToSkill: null,
    tags: [],
    examplePrompts: [],
    ...def,
  };
}

export const SEEDED_GENERATED_TOOLS = [
  makeSeededTool({
    id: 'readability-score',
    name: 'Readability Scorer',
    description: 'Computes a Flesch-Kincaid-style readability score for DA page content and returns level, word count, sentence count, and average words per sentence.',
    capability: 'web-worker',
    tags: ['readability', 'reading level', 'content quality', 'grade level'],
    examplePrompts: [
      'check readability of this page',
      'is this copy too hard to read',
      'score the reading level of this content',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'Page HTML or plain text to analyse.' },
      },
      required: ['html'],
    },
    implementation: {
      type: 'web-worker',
      entry: 'readability-score',
    },
  }),
  makeSeededTool({
    id: 'validate-headings',
    name: 'Heading Hierarchy Validator',
    description: 'Validates heading structure in DA page HTML, including missing h1, multiple h1 tags, and heading level skips.',
    capability: 'web-worker',
    tags: ['headings', 'accessibility', 'seo', 'structure', 'outline'],
    examplePrompts: [
      'validate heading hierarchy',
      'check page structure for heading issues',
      'find accessibility issues in my headings',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'Page HTML to validate.' },
      },
      required: ['html'],
    },
    implementation: {
      type: 'web-worker',
      entry: 'validate-headings',
    },
  }),
];

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(text) {
  return normalizeWhitespace(text).toLowerCase();
}

function tokenize(text) {
  return normalizeText(text)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ');
}

function getInputText(args) {
  return normalizeWhitespace(args?.html || args?.text || args?.content || '');
}

export function mergeWithSeededGeneratedTools(storedDefs = []) {
  const seededById = new Map(SEEDED_GENERATED_TOOLS.map((tool) => [tool.id, tool]));
  const storedById = new Map(
    (Array.isArray(storedDefs) ? storedDefs : [])
      .filter(Boolean)
      .map((tool) => [tool.id, tool]),
  );

  const merged = SEEDED_GENERATED_TOOLS.map((seed) => ({
    ...seed,
    ...(storedById.get(seed.id) || {}),
  }));

  storedById.forEach((tool, id) => {
    if (!seededById.has(id)) merged.push(tool);
  });

  return merged;
}

function buildToolSearchCorpus(tool) {
  return [
    tool?.id,
    tool?.name,
    tool?.description,
    ...(Array.isArray(tool?.tags) ? tool.tags : []),
    ...(Array.isArray(tool?.examplePrompts) ? tool.examplePrompts : []),
  ]
    .filter(Boolean)
    .join(' ');
}

export function scoreGeneratedToolMatch(query, tool) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return { score: 0, matchedTerms: [] };

  const corpus = normalizeText(buildToolSearchCorpus(tool));
  const tokens = [...new Set(tokenize(query))];
  const matchedTerms = tokens.filter((token) => corpus.includes(token));
  let score = matchedTerms.length * 3;

  if (corpus.includes(normalizedQuery)) score += 12;

  (tool?.tags || []).forEach((tag) => {
    if (normalizedQuery.includes(normalizeText(tag))) score += 4;
  });

  (tool?.examplePrompts || []).forEach((prompt) => {
    const promptText = normalizeText(prompt);
    if (promptText.includes(normalizedQuery) || normalizedQuery.includes(promptText)) {
      score += 6;
    }
  });

  return { score, matchedTerms };
}

export function findBestGeneratedTool(query, tools = []) {
  const approved = (Array.isArray(tools) ? tools : []).filter((tool) => tool?.status === 'approved');
  let best = null;

  approved.forEach((tool) => {
    const { score, matchedTerms } = scoreGeneratedToolMatch(query, tool);
    if (!best || score > best.score) {
      best = { tool, score, matchedTerms };
    }
  });

  return best && best.score > 0 ? best : null;
}

function countSyllables(word) {
  const normalized = String(word || '')
    .toLowerCase()
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  const groups = normalized.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

export function executeReadabilityTool(args = {}) {
  const input = getInputText(args);
  const text = normalizeWhitespace(stripHtml(input));
  if (!text) {
    throw new Error('No text content found.');
  }

  const sentences = text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 5) {
    throw new Error('Too short to score (need at least 5 words).');
  }

  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const sentenceCount = Math.max(sentences.length, 1);
  const score = 206.835
    - 1.015 * (words.length / sentenceCount)
    - 84.6 * (syllables / words.length);
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  let level = 'Very difficult (academic)';
  if (clamped >= 80) level = 'Easy (6th grade)';
  else if (clamped >= 60) level = 'Standard (8th–9th grade)';
  else if (clamped >= 40) level = 'Difficult (college level)';

  return {
    score: clamped,
    level,
    words: words.length,
    sentences: sentences.length,
    avgWordsPerSentence: Math.round(words.length / sentenceCount),
  };
}

export function executeHeadingValidationTool(args = {}) {
  const html = String(args?.html || args?.text || args?.content || '');
  if (!normalizeWhitespace(html)) {
    throw new Error('No HTML content found.');
  }

  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings = [];
  let match;
  while ((match = headingRe.exec(html)) !== null) {
    headings.push({
      level: Number(match[1]),
      text: normalizeWhitespace(stripHtml(match[2])),
    });
  }

  if (!headings.length) {
    return { valid: false, headings: 0, issues: ['No heading tags found'] };
  }

  const issues = [];
  if (headings[0].level !== 1) {
    issues.push(`Starts with h${headings[0].level} — expected h1`);
  }

  const h1Count = headings.filter((heading) => heading.level === 1).length;
  if (h1Count > 1) {
    issues.push(`${h1Count} h1 tags found — should have exactly one`);
  }

  for (let i = 1; i < headings.length; i += 1) {
    const prev = headings[i - 1];
    const current = headings[i];
    if (current.level - prev.level > 1) {
      issues.push(`Level skip: h${prev.level} → h${current.level} before "${current.text}"`);
    }
  }

  return {
    valid: issues.length === 0,
    headings: headings.length,
    issues,
  };
}

export function executeGeneratedTool({ toolId, implementation, args }) {
  const entry = implementation?.entry || toolId;
  switch (entry) {
    case 'readability-score':
      return executeReadabilityTool(args);
    case 'validate-headings':
      return executeHeadingValidationTool(args);
    default:
      throw new Error(`Unsupported generated tool: ${entry}`);
  }
}
