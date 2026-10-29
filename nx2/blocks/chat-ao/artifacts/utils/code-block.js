const LANGUAGES = new Map([
  ['javascript', 'javascript'], ['js', 'javascript'],
  ['markup', 'markup'], ['html', 'markup'], ['xml', 'markup'], ['svg', 'markup'],
  ['css', 'css'], ['json', 'json'],
]);

const loadGrammar = (() => {
  let prismPromise;
  const grammars = new Map();
  return (language) => {
    if (!grammars.has(language)) {
      prismPromise ??= import('../../../../../nx/blocks/form/deps/prism.js');
      grammars.set(language, prismPromise.then(async ({ default: prism }) => {
        // Tokenize only requested artifacts, not Prism's document-wide code blocks.
        prism.manual = true;
        if (language === 'json' && !prism.languages.json) {
          await import('../../../../../nx/blocks/form/deps/prism-json.min.js');
        }
        return { prism, grammar: prism.languages[language] };
      }));
    }
    return grammars.get(language);
  };
})();

export async function tokenizeCode({ text, language }) {
  const name = LANGUAGES.get(language?.trim().toLowerCase());
  if (!name || !text) return text;
  try {
    const { prism, grammar } = await loadGrammar(name);
    if (!grammar) throw new Error(`Missing syntax grammar: ${name}`);
    return prism.tokenize(text, grammar);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Unable to highlight code artifact; keeping plain text.', error);
    return text;
  }
}
