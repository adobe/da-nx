export function prettyPrintNode(node, indent = 0) {
  let result = '';
  const indentString = '  '.repeat(indent);

  if (node.nodeType === Node.TEXT_NODE) {
    const textContent = node.textContent.trim();
    if (textContent) {
      result += `${indentString}${textContent}\n`;
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    result += `${indentString}<${node.nodeName.toLowerCase()}`;

    // Add attributes
    for (const attr of node.attributes) {
      result += ` ${attr.name}="${attr.value}"`;
    }
    result += '>\n';

    // Recursively process child nodes
    for (const child of node.childNodes) {
      result += prettyPrintNode(child, indent + 1);
    }

    result += `${indentString}</${node.nodeName.toLowerCase()}>\n`;
  }

  return result;
}

export function normalizeHtml(html, { ignoreHeaderAndFooter = false } = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (ignoreHeaderAndFooter) {
    const header = doc.querySelector('header');
    const footer = doc.querySelector('footer');
    if (header) header.remove();
    if (footer) footer.remove();
  }
  return prettyPrintNode(doc.documentElement);
}
