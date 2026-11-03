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
  // `Image` is the legacy column name, kept as a fallback while sheets migrate to `Icon`.
  const iconHref = toSafeHref({ value: row.Icon || row.Image, origin });

  return {
    title, description, docHref, tryHref, owner, iconHref,
  };
}

export function isAdobeOwned({ owner }) {
  return owner?.toLowerCase() === 'adobe';
}

// The owner filter is only useful when both Adobe and non-Adobe extensions are listed.
export function hasMixedOwners(items = []) {
  return items.some(isAdobeOwned) && items.some((item) => !isAdobeOwned(item));
}

export const OWNER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'adobe', label: 'Created by Adobe' },
  { value: 'others', label: 'Created by Others' },
];

export function filterByOwner({ items, filter = 'all' }) {
  if (filter === 'adobe') return items.filter(isAdobeOwned);
  if (filter === 'others') return items.filter((item) => !isAdobeOwned(item));
  return items;
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
