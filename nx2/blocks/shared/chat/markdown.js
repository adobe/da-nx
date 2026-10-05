const { unified, remarkParse, remarkGfmNoLink, mdast2hast } = await import('../../../deps/mdast/dist/index.js');

const parser = unified().use(remarkParse).use(remarkGfmNoLink);

export function parseMarkdown(text) {
  return mdast2hast(parser.parse(text));
}
