import { getFirstSheet } from '../../utils/utils.js';

export const MARKETPLACE_PATH = '/marketplace.json';

function toSafeHref({ value, origin }) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed, origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    // fall through to undefined
  }
  return undefined;
}

export function normalizeItem({ row, origin }) {
  const title = (row.Title ?? '').trim();
  const docHref = toSafeHref({ value: row['Doc Url'], origin });
  const tryHref = toSafeHref({ value: row['Try Url'], origin });
  if (!title || (!docHref && !tryHref)) return null;

  const description = (row.Description ?? '').trim();
  const owner = (row.Owner ?? '').trim();
  const category = (row.Category ?? '').trim();
  // `Image` is the legacy column name, kept as a fallback while sheets migrate to `Icon`.
  const iconHref = toSafeHref({ value: row.Icon || row.Image, origin });

  return {
    title, description, docHref, tryHref, owner, category, iconHref,
  };
}

export function getCategories(el) {
  return [...el.classList].slice(1).map((cls) => cls.toLowerCase());
}

export function filterByCategories({ items, categories = [] }) {
  if (!categories.length) return items;
  return items.filter(({ category }) => categories.includes(category?.toLowerCase()));
}

export function isAdobeOwned({ owner }) {
  return owner?.toLowerCase() === 'adobe';
}

export function getActions({ docHref, tryHref }) {
  return [
    docHref && { id: 'learn', label: 'Learn more', href: docHref },
    tryHref && { id: 'try', label: 'Try out', href: tryHref },
  ].filter(Boolean);
}

export async function fetchMarketplace({ origin }) {
  try {
    const resp = await fetch(new URL(MARKETPLACE_PATH, origin));
    if (!resp.ok) return { error: 'Could not load marketplace.', status: resp.status };

    const json = await resp.json();
    const sheet = getFirstSheet(json);
    const data = Array.isArray(sheet) ? sheet : [];
    const items = data.map((row) => normalizeItem({ row, origin })).filter(Boolean);

    return { items };
  } catch {
    return { error: 'Could not load marketplace.' };
  }
}
