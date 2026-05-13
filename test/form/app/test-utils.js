export function cleanHtmlWhitespace(html) {
  return html.replace(/>\s+</g, '><').trim().replace(/\s+/g, ' ').trim();
}

export function normalizeHtml(html) {
  // Extract just the main content, remove dynamic GUIDs for comparison
  const cleaned = cleanHtmlWhitespace(html);
  // Replace dynamic GUIDs with a placeholder for comparison
  return cleaned.replace(/-([\w]{6})/g, '-GUID');
}
