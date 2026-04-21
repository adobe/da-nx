import { EDITOR_TEXT_FORMAT_ITEMS } from '../../editor-utils/commands.js';

const SLASH_ONLY_TEXT_ITEMS = [
  { id: 'section-break', label: 'Section break', icon: 'Separator' },
  { id: 'lorem-ipsum', label: 'Lorem ipsum', icon: 'Rail' },
];

export const SLASH_MENU_GROUPS = [
  {
    section: 'Blocks',
    items: [
      { id: 'open-library', label: 'Open library', icon: 'CCLibrary' },
      { id: 'insert-block', label: 'Insert block', icon: 'TableAdd' },
    ],
  },
  {
    section: 'Text',
    items: [...EDITOR_TEXT_FORMAT_ITEMS, ...SLASH_ONLY_TEXT_ITEMS],
  },
];

function flatten(groups) {
  return groups.flatMap(({ section, items }) => [{ section }, ...items]);
}

/** Flat list for `nx-menu`: `{ section }` rows plus `{ id, label, icon }` rows. */
export function slashMenuItemsForQuery(query) {
  const q = (query || '').toLowerCase();
  if (!q) return flatten(SLASH_MENU_GROUPS);
  return flatten(
    SLASH_MENU_GROUPS
      .map(({ section, items }) => ({
        section,
        items: items.filter((i) => i.label.toLowerCase().startsWith(q)),
      }))
      .filter((g) => g.items.length > 0),
  );
}
