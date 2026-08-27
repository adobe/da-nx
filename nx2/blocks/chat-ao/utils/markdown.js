import { nothing } from 'da-lit';
import { parseMarkdown } from '../../shared/chat/markdown.js';
import { linkifyBareUrls, sanitizeLinks } from '../../chat/utils/links.js';

const { hastToDom } = await import('../../../deps/mdast/dist/index.js');

// mdast-to-hast puts a fence's declared language in a "language-xxx" class on <code>.
function enhanceCodeBlocks(fragment) {
  fragment.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    const language = code.className.match(/language-(\S+)/)?.[1];
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.replaceWith(wrapper);
    if (language) {
      const header = document.createElement('div');
      header.className = 'code-block-header';
      const label = document.createElement('span');
      label.className = 'code-block-lang';
      label.textContent = language;
      header.append(label);
      wrapper.append(header);
    }
    wrapper.append(pre);
  });
  return fragment;
}

export function renderMarkdown(text) {
  if (!text) return nothing;
  const hast = sanitizeLinks(linkifyBareUrls(parseMarkdown(text)));
  return enhanceCodeBlocks(hastToDom(hast, { fragment: true }));
}

// See docs/chat-ao-component.md#question-flow — not folded into renderMarkdown itself.
export function unescapeLiteralNewlines(text) {
  return (text ?? '').replace(/\\r\\n|\\n/g, '\n');
}
