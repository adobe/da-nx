import { html, nothing } from 'da-lit';

const BLOCK_RE = /^:::(\w[\w-]*)\n([\s\S]*?)^:::\s*$/gm;
const INLINE_RE = /\*\*([\s\S]*?)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]]+)\]\(([^)]+)\)/g;

function renderInline(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    if (m[1] !== undefined) {
      parts.push(html`<strong>${m[1]}</strong>`);
    } else if (m[2] !== undefined) {
      parts.push(html`<em>${m[2]}</em>`);
    } else if (m[3] !== undefined) {
      parts.push(html`<code>${m[3]}</code>`);
    } else {
      parts.push(html`<a href="${m[5]}" target="_blank" rel="noopener noreferrer">${m[4]}</a>`);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) { parts.push(text.slice(last)); }
  return parts.length > 1 ? parts : text;
}

function renderBlock(type, content) {
  if (type === 'list') {
    const items = content.split('\n')
      .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter(Boolean);
    return html`<ul class="chat-list">${items.map((item) => html`<li>${renderInline(item)}</li>`)}</ul>`;
  }

  return nothing;
}

function renderText(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) {
      i += 1;
    } else if (/^(#{1,4})\s+(.+)/.test(trimmed)) {
      const [, hashes, content] = trimmed.match(/^(#{1,4})\s+(.+)/);
      result.push(html`<h${hashes.length}>${renderInline(content)}</h${hashes.length}>`);
      i += 1;
    } else if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, '').trim());
        i += 1;
      }
      result.push(html`<ol>${items.map((item) => html`<li>${renderInline(item)}</li>`)}</ol>`);
    } else if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, '').trim());
        i += 1;
      }
      result.push(html`<ul>${items.map((item) => html`<li>${renderInline(item)}</li>`)}</ul>`);
    } else {
      result.push(html`<p>${renderInline(trimmed)}</p>`);
      i += 1;
    }
  }

  return result;
}

export function renderMessageContent(text) {
  if (!text) {
    return nothing;
  }

  const segments = [];
  let last = 0;

  for (const m of text.matchAll(BLOCK_RE)) {
    if (m.index > last) {
      segments.push(...renderText(text.slice(last, m.index)));
    }

    segments.push(renderBlock(m[1], m[2]));
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    segments.push(...renderText(text.slice(last)));
  }

  return segments;
}
