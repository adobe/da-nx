import HTMLConverter from '../../form/utils/html2json.js';

export function convertHtmlToJson(html) {
  if (typeof html !== 'string' || !html.trim()) return null;

  try {
    const converter = new HTMLConverter(html);
    return converter.json;
  } catch {
    return null;
  }
}

export function isEmptyDocumentHtml(htmlString) {
  if (typeof htmlString !== 'string') return false;

  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const mainContainer = doc.querySelector('body > main > div');
  if (!mainContainer) return false;

  if (mainContainer.tagName !== 'DIV') return false;
  if (mainContainer.childElementCount !== 0) return false;
  if (mainContainer.textContent.trim().length > 0) return false;

  return true;
}

export function isStructuredContentHtml(htmlString) {
  if (!htmlString) return false;

  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const formBlock = doc.querySelector('body > main > div > div.da-form');
  if (!formBlock) return false;

  const rows = Array.from(formBlock.children)
    .filter((row) => row.children.length >= 2);
  if (rows.length === 0) return false;

  const keys = rows
    .map((row) => row.children[0]?.textContent?.trim().toLowerCase())
    .filter(Boolean);

  const hasTitle = keys.includes('title');
  const hasSchemaName = keys.includes('x-schema-name');
  return hasTitle && hasSchemaName;
}
