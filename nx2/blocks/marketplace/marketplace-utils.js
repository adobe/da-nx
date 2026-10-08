export const MARKETPLACE_PATH = '/apps/marketplace.json';

// Mirrors getFirstSheet in nx2/utils/daConfig.js, which is not imported because it
// pulls in api.js and its IMS loading — unnecessary for this public, unauthenticated sheet.
function getFirstSheet(json) {
  if (json?.[':type'] !== 'multi-sheet') return json?.data;
  return json[json[':names']?.[0]]?.data;
}

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
  const href = toSafeHref({ value: row.Path, origin });
  if (!title || !href) return null;

  const description = (row.Description ?? '').trim();
  const types = (row.Type ?? '').split('&').map((type) => type.trim()).filter(Boolean);
  const imageHref = toSafeHref({ value: row.Image, origin });

  return {
    title, description, href, types, imageHref,
  };
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
