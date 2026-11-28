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
  const category = (row.Category ?? '').trim();
  const iconHref = toSafeHref({ value: row.Logo, origin });

  return {
    title, description, docHref, tryHref, category, iconHref,
  };
}

const ALL_FILTER = { value: 'all', label: 'All Types' };

export function getCategoryFilters(items = []) {
  const categories = items.reduce((acc, { category }) => {
    const value = category?.toLowerCase();
    if (value && value !== ALL_FILTER.value && !acc.has(value)) acc.set(value, category);
    return acc;
  }, new Map());
  return [ALL_FILTER, ...[...categories].map(([value, label]) => ({ value, label }))];
}

export function filterByCategory({ items, filter = ALL_FILTER.value }) {
  if (filter === ALL_FILTER.value) return items;
  return items.filter(({ category }) => category?.toLowerCase() === filter);
}

export function searchItems({ items, query }) {
  const needle = (query ?? '').trim().toLowerCase();
  if (!needle) return items;
  return items.filter(({ title = '', description = '' }) => (
    title.toLowerCase().includes(needle) || description.toLowerCase().includes(needle)));
}

export function getVisibleItems({ items, filter, query }) {
  return searchItems({ items: filterByCategory({ items, filter }), query });
}

// List rows: View details last (rightmost). Grid cards: View details first.
export function getActions({ docHref, tryHref, view = 'list' }) {
  const details = docHref && { id: 'details', label: 'View details', href: docHref };
  const tryOut = tryHref && { id: 'try', label: 'Try out', href: tryHref };
  const ordered = view === 'grid' ? [details, tryOut] : [tryOut, details];
  return ordered.filter(Boolean);
}

async function loadMarketplace({ origin }) {
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

// Shares one request per origin; failed results are evicted so a later call retries.
const marketplaceCache = (() => {
  const requests = new Map();
  return {
    fetch({ origin }) {
      if (!requests.has(origin)) {
        const request = loadMarketplace({ origin }).then((result) => {
          if (result.error) requests.delete(origin);
          return result;
        });
        requests.set(origin, request);
      }
      return requests.get(origin);
    },
    reset: () => requests.clear(),
  };
})();

export const fetchMarketplace = marketplaceCache.fetch;

// Test-only: clears the shared per-origin request cache.
export const resetMarketplaceCache = marketplaceCache.reset;
