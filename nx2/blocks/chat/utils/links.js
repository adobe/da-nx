// Link-handling hast transforms shared by the chat renderer.
//
// remarkGfmNoLink intentionally omits GFM autolink literals, so the agent's
// bare URLs arrive as plain text. `linkifyBareUrls` re-adds them as anchors,
// and `sanitizeLinks` enforces a safe href + target/rel on every anchor.

const SAFE_URL = /^https?:\/\//i;
const BARE_URL = /https?:\/\/[^\s<>]+/g;
const TRAILING_PUNCT = /[.,;:!?]+$/;
// Tags whose text should stay literal (already a link, or code).
const LINKIFY_SKIP = new Set(['a', 'code', 'pre']);

const countChar = (str, char) => str.split(char).length - 1;

// Split a text node's value into text + anchor hast nodes for each bare URL.
// Returns null when the value contains no URL, so callers can keep the original node.
function splitUrlText(value) {
  const nodes = [];
  let lastIndex = 0;
  let matched = false;

  for (const match of value.matchAll(BARE_URL)) {
    matched = true;
    let url = match[0];
    let trailing = '';

    // Pull trailing sentence punctuation back out of the URL.
    const punct = url.match(TRAILING_PUNCT);
    if (punct) {
      [trailing] = punct;
      url = url.slice(0, -trailing.length);
    }
    // Drop a dangling ")" that closes a paren opened outside the URL, e.g. "(see https://x.com)".
    while (url.endsWith(')') && countChar(url, ')') > countChar(url, '(')) {
      trailing = `)${trailing}`;
      url = url.slice(0, -1);
    }

    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: value.slice(lastIndex, match.index) });
    }
    nodes.push({
      type: 'element',
      tagName: 'a',
      properties: { href: url },
      children: [{ type: 'text', value: url }],
    });
    if (trailing) nodes.push({ type: 'text', value: trailing });
    lastIndex = match.index + match[0].length;
  }

  if (!matched) return null;
  if (lastIndex < value.length) nodes.push({ type: 'text', value: value.slice(lastIndex) });
  return nodes;
}

// Walk a hast tree and wrap bare http(s) URLs in text nodes as anchor elements.
export function linkifyBareUrls(node) {
  if (!node.children) return node;
  if (node.type === 'element' && LINKIFY_SKIP.has(node.tagName)) return node;

  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return splitUrlText(child.value) ?? [child];
    return [linkifyBareUrls(child)];
  });
  return node;
}

// Force every anchor to a safe href and open externally without leaking the opener.
export function sanitizeLinks(node) {
  if (node.type === 'element' && node.tagName === 'a') {
    const href = node.properties?.href ?? '';
    node.properties = {
      ...node.properties,
      href: SAFE_URL.test(href) ? href : '#',
      target: '_blank',
      rel: ['noopener', 'noreferrer'],
    };
  }
  node.children?.forEach(sanitizeLinks);
  return node;
}
