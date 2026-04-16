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
    items: [
      { id: 'heading-1', label: 'Heading 1', icon: 'Heading1' },
      { id: 'heading-2', label: 'Heading 2', icon: 'Heading2' },
      { id: 'heading-3', label: 'Heading 3', icon: 'Heading3' },
      { id: 'blockquote', label: 'Blockquote', icon: 'BlockQuote' },
      { id: 'code-block', label: 'Code block', icon: 'BlockCode' },
      { id: 'bullet-list', label: 'Bullet list', icon: 'ListBulleted' },
      { id: 'numbered-list', label: 'Numbered list', icon: 'ListNumbered' },
      { id: 'section-break', label: 'Section break', icon: 'Separator' },
      { id: 'lorem-ipsum', label: 'Lorem ipsum', icon: 'Rail' },
    ],
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
