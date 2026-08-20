import { nothing } from 'da-lit';
import { parseMarkdown } from '../../shared/chat/markdown.js';
import { linkifyBareUrls, sanitizeLinks } from '../../chat/utils/links.js';

const { hastToDom } = await import('../../../deps/mdast/dist/index.js');

export function renderMarkdown(text) {
  if (!text) return nothing;
  return hastToDom(sanitizeLinks(linkifyBareUrls(parseMarkdown(text))), { fragment: true });
}

// See docs/chat-ao-component.md#question-flow — not folded into renderMarkdown itself.
export function unescapeLiteralNewlines(text) {
  return (text ?? '').replace(/\\r\\n|\\n/g, '\n');
}
