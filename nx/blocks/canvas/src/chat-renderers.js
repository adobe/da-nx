// eslint-disable-next-line import/no-unresolved
import { html, nothing } from 'da-lit';

/**
 * Block syntax: :::type{attrs}\n content \n:::
 * Captures: type, optional {attrs}, and inner content.
 */
const BLOCK_RE = /^:::(\w[\w-]*)\s*(?:\{([^}]*)\})?\s*\n([\s\S]*?)^:::\s*$/gm;

function parseAttrs(raw) {
  if (!raw) return {};
  const attrs = {};
  const re = /(\w[\w-]*)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(raw))) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4];
  }
  return attrs;
}

function parseListItems(content) {
  return content
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
}

function parseCheckItems(content) {
  return content
    .split('\n')
    .filter((l) => /^\s*[-*]\s*\[[ xX]\]/.test(l))
    .map((l) => {
      const checked = /\[[xX]\]/.test(l);
      const text = l.replace(/^\s*[-*]\s*\[[ xX]\]\s*/, '').trim();
      return { text, checked };
    });
}

function parseToggleItems(content) {
  const items = [];
  const lines = content.split('\n');
  let current = null;
  lines.forEach((line) => {
    const summaryMatch = line.match(/^\s*>\s+(.+)/);
    if (summaryMatch) {
      if (current) items.push(current);
      current = { summary: summaryMatch[1].trim(), detail: '' };
    } else if (current) {
      const trimmed = line.replace(/^\s{2,}/, '');
      if (trimmed) current.detail += (current.detail ? '\n' : '') + trimmed;
    }
  });
  if (current) items.push(current);
  return items;
}

// ── Individual renderers ──────────────────────────────────────

function renderList(content) {
  const items = parseListItems(content);
  if (!items.length) return nothing;
  return html`
    <div class="cr-list">
      <ul class="cr-list-ul">
        ${items.map((item) => html`<li class="cr-list-item">${item}</li>`)}
      </ul>
    </div>`;
}

function renderTodoList(content) {
  const items = parseCheckItems(content);
  if (!items.length) return nothing;
  return html`
    <div class="cr-todo">
      ${items.map((item) => html`
        <label class="cr-todo-item">
          <input type="checkbox" .checked=${item.checked} disabled />
          <span class="cr-todo-text ${item.checked ? 'done' : ''}">${item.text}</span>
        </label>
      `)}
    </div>`;
}

function renderToggleList(content) {
  const items = parseToggleItems(content);
  if (!items.length) return nothing;
  return html`
    <div class="cr-toggle-list">
      ${items.map((item) => html`
        <details class="cr-toggle-item">
          <summary class="cr-toggle-summary">${item.summary}</summary>
          <div class="cr-toggle-detail">${item.detail}</div>
        </details>
      `)}
    </div>`;
}

function renderChecklist(content) {
  const items = parseCheckItems(content);
  if (!items.length) return nothing;
  return html`
    <div class="cr-checklist">
      ${items.map((item) => html`
        <label class="cr-checklist-item">
          <span class="cr-checklist-marker ${item.checked ? 'checked' : ''}">
            ${item.checked
    ? html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.25 4.75 6 12 2.75 8.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : nothing}
          </span>
          <span class="cr-checklist-text ${item.checked ? 'done' : ''}">${item.text}</span>
        </label>
      `)}
    </div>`;
}

function renderImageCard(content, attrs) {
  const src = attrs.src || '';
  const alt = attrs.alt || '';
  const lines = content.split('\n').filter((l) => l.trim());
  const title = lines[0] || '';
  const description = lines.slice(1).join('\n').trim();
  return html`
    <div class="cr-image-card">
      ${src ? html`<img class="cr-image-card-img" src="${src}" alt="${alt || title}" loading="lazy" />` : nothing}
      ${title ? html`<div class="cr-image-card-title">${title}</div>` : nothing}
      ${description ? html`<div class="cr-image-card-desc">${description}</div>` : nothing}
    </div>`;
}

function renderImageCardGroup(content) {
  const cardRe = /:::image-card\s*(?:\{([^}]*)\})?\s*\n([\s\S]*?):::/g;
  const cards = [];
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = cardRe.exec(content))) {
    cards.push({ attrs: parseAttrs(m[1]), content: m[2] });
  }
  if (!cards.length) return nothing;
  return html`
    <div class="cr-image-card-group">
      ${cards.map((c) => renderImageCard(c.content, c.attrs))}
    </div>`;
}

function renderFile(content, attrs) {
  const name = attrs.name || content.trim() || 'Untitled';
  const size = attrs.size || '';
  const type = (attrs.type || name.split('.').pop() || '').toLowerCase();

  const iconMap = {
    pdf: html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="1" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="#FEE2E2"/><text x="10" y="13" text-anchor="middle" font-size="6" font-weight="700" fill="#DC2626">PDF</text></svg>`,
    doc: html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="1" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="#DBEAFE"/><text x="10" y="13" text-anchor="middle" font-size="6" font-weight="700" fill="#2563EB">DOC</text></svg>`,
    xls: html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="1" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="#D1FAE5"/><text x="10" y="13" text-anchor="middle" font-size="6" font-weight="700" fill="#059669">XLS</text></svg>`,
    default: html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="1" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="#F3F4F6"/><path d="M7 7h6M7 10h6M7 13h4" stroke="#9CA3AF" stroke-width="1" stroke-linecap="round"/></svg>`,
  };
  let resolvedType = 'default';
  if (type === 'pdf') {
    resolvedType = 'pdf';
  } else if (['doc', 'docx'].includes(type)) {
    resolvedType = 'doc';
  } else if (['xls', 'xlsx', 'csv'].includes(type)) {
    resolvedType = 'xls';
  }
  const icon = iconMap[resolvedType];

  return html`
    <div class="cr-file">
      <span class="cr-file-icon">${icon}</span>
      <div class="cr-file-info">
        <span class="cr-file-name">${name}</span>
        ${size ? html`<span class="cr-file-size">${size}</span>` : nothing}
      </div>
    </div>`;
}

function renderAlert(content, variant) {
  const text = content.trim();
  if (!text) return nothing;

  const icons = {
    info: html`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4M8 5.5v-.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    warning: html`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5 14.5 13H1.5L8 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v3M8 11v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    error: html`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  };

  return html`
    <div class="cr-alert cr-alert-${variant}">
      <span class="cr-alert-icon">${icons[variant] || icons.info}</span>
      <span class="cr-alert-text">${text}</span>
    </div>`;
}

// ── Inline markdown: links, **bold**, `code` ─────────────────

function sanitizeHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) return '';
  if (href.startsWith('/')) return href;
  try {
    const parsed = new URL(href, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return href;
  } catch {
    return '';
  }
  return '';
}

function renderInline(text) {
  const INLINE_RE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([\s\S]*?)\*\*|`([^`\n]+)`/g;
  const parts = [];
  let last = 0;
  let m;
  INLINE_RE.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined && m[2] !== undefined) {
      const safeHref = sanitizeHref(m[2]);
      if (safeHref) {
        const openInNewTab = /^https?:\/\//.test(safeHref);
        parts.push(openInNewTab
          ? html`<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${m[1]}</a>`
          : html`<a href="${safeHref}">${m[1]}</a>`);
      } else {
        parts.push(m[0]);
      }
    } else if (m[3] !== undefined) {
      parts.push(html`<strong>${m[3]}</strong>`);
    } else {
      parts.push(html`<code class="cr-inline-code">${m[4]}</code>`);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.length === 0 || (parts.length === 1 && typeof parts[0] === 'string')) return text;
  return parts;
}

// ── Text segment: headings, lists, inline formatting ─────────

function renderTextSegment(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  let lastWasBlock = false;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rules (--- / *** / ___) — skip entirely
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      i += 1;
      continue; // eslint-disable-line no-continue
    }

    // Blank lines — skip; block elements provide their own spacing via CSS
    if (line.trim() === '') {
      i += 1;
      lastWasBlock = false;
      continue; // eslint-disable-line no-continue
    }

    // ATX headings: # H1 through #### H4
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      result.push(html`<div class="cr-heading cr-h${level}">${renderInline(hMatch[2])}</div>`);
      i += 1;
      lastWasBlock = true;
      continue; // eslint-disable-line no-continue
    }

    // Numbered list — collect consecutive numbered lines
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, '').trim());
        i += 1;
      }
      result.push(html`<ol class="cr-md-ol">${items.map((item) => html`<li class="cr-md-ol-item">${renderInline(item)}</li>`)}</ol>`);
      lastWasBlock = true;
      continue; // eslint-disable-line no-continue
    }

    // Bullet list — collect consecutive bullet lines
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, '').trim());
        i += 1;
      }
      result.push(html`<ul class="cr-md-list">${items.map((item) => html`<li class="cr-md-list-item">${renderInline(item)}</li>`)}</ul>`);
      lastWasBlock = true;
      continue; // eslint-disable-line no-continue
    }

    // Regular text — add a line break before if previous was a block element
    if (lastWasBlock && result.length > 0) result.push(html`<br />`);
    result.push(renderInline(line));
    lastWasBlock = false;
    i += 1;
  }

  if (result.every((r) => typeof r === 'string')) return text;
  return result;
}

// ── Renderer dispatch ─────────────────────────────────────────

const RENDERERS = {
  list: (content) => renderList(content),
  todo: (content) => renderTodoList(content),
  checklist: (content) => renderChecklist(content),
  'toggle-list': (content) => renderToggleList(content),
  'image-card': (content, attrs) => renderImageCard(content, attrs),
  'image-card-group': (content) => renderImageCardGroup(content),
  file: (content, attrs) => renderFile(content, attrs),
  'alert-info': (content) => renderAlert(content, 'info'),
  'alert-warning': (content) => renderAlert(content, 'warning'),
  'alert-error': (content) => renderAlert(content, 'error'),
};

/**
 * Parse assistant message text, rendering :::block::: segments with custom
 * renderers and leaving everything else as plain text.
 * Returns an array of Lit template results suitable for interpolation.
 */
export function renderMessageContent(text) {
  if (!text || typeof text !== 'string') return text;

  const segments = [];
  let lastIndex = 0;
  let match;

  BLOCK_RE.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = BLOCK_RE.exec(text))) {
    const before = text.slice(lastIndex, match.index);
    if (before) segments.push(renderTextSegment(before));

    const [, type, rawAttrs, content] = match;
    const renderer = RENDERERS[type];
    if (renderer) {
      segments.push(renderer(content, parseAttrs(rawAttrs)));
    } else {
      segments.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex);
  if (tail) segments.push(renderTextSegment(tail));

  if (segments.length === 0) return nothing;
  if (segments.length === 1) return segments[0];
  return segments;
}
