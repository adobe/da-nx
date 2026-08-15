import { nothing } from 'da-lit';
import { parseMarkdown } from '../../shared/chat/markdown.js';
import { sanitizeLinks } from '../../chat/utils/links.js';

const { hastToDom } = await import('../../../deps/mdast/dist/index.js');

export function renderMarkdown(text) {
  if (!text) return nothing;
  return hastToDom(sanitizeLinks(parseMarkdown(text)), { fragment: true });
}
