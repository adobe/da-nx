/**
 * Block picker dialog for inserting a block into a specific section.
 * Uses a native <dialog> with Spectrum-style CSS, mirroring the link dialog pattern.
 * Fetches the configured block list from the da-live library.
 */
// eslint-disable-next-line import/no-unresolved
import { getLibraryList } from 'https://da.live/blocks/edit/da-library/helpers/helpers.js';

let dialogEl = null;
let listEl = null;
let searchEl = null;
let okBtn = null;
let selectedItem = null; // { name, parsed }
let pendingResolve = null;
let allItems = []; // [{ name, parsed }]

function injectStyles() {
  if (document.getElementById('da-block-picker-style')) return;
  const style = document.createElement('style');
  style.id = 'da-block-picker-style';
  style.textContent = `
    #da-block-picker-dialog {
      padding: 24px;
      border: none;
      border-radius: var(--spectrum-corner-radius-200, 8px);
      min-width: 400px;
      max-width: 520px;
      max-height: 80vh;
      box-shadow: 0 4px 16px rgba(0,0,0,0.24);
      background: var(--spectrum-white, #fff);
      color: var(--spectrum-gray-900, #1d1d1d);
      font-family: var(--spectrum-sans-font-family-stack, adobe-clean, sans-serif);
    }
    #da-block-picker-dialog[open] {
      display: flex;
      flex-direction: column;
    }
    #da-block-picker-dialog::backdrop {
      background: rgba(0,0,0,0.4);
    }
    #da-block-picker-dialog h3 {
      margin: 0 0 8px;
      font-size: var(--spectrum-heading-size-s, 18px);
      font-weight: 700;
      flex-shrink: 0;
    }
    #da-block-picker-dialog hr.da-block-picker-divider {
      border: none;
      border-top: 1px solid var(--spectrum-gray-200, #e0e0e0);
      margin: 0 -24px 12px;
      flex-shrink: 0;
    }
    .da-block-picker-search {
      flex-shrink: 0;
      margin-bottom: 8px;
    }
    .da-block-picker-search input {
      width: 100%;
      box-sizing: border-box;
      height: 32px;
      padding: 0 8px;
      border: 1px solid var(--spectrum-gray-400, #b3b3b3);
      border-radius: var(--spectrum-corner-radius-100, 4px);
      font-size: 0.875rem;
      font-family: inherit;
      color: var(--spectrum-gray-900, #1d1d1d);
      background: var(--spectrum-white, #fff);
      outline: none;
    }
    .da-block-picker-search input:focus {
      border-color: var(--spectrum-blue-700, #1473e6);
      box-shadow: 0 0 0 2px rgb(20 115 230 / 25%);
    }
    .da-block-picker-list {
      flex: 1;
      overflow-y: auto;
      list-style: none;
      margin: 0 -24px;
      padding: 0 8px;
      min-height: 80px;
      max-height: 340px;
    }
    .da-block-picker-list li button {
      display: block;
      width: 100%;
      text-align: left;
      padding: 7px 12px;
      border: none;
      border-radius: var(--spectrum-corner-radius-100, 4px);
      background: transparent;
      cursor: pointer;
      font-size: 0.875rem;
      font-family: inherit;
      color: var(--spectrum-gray-800, #2c2c2c);
      text-transform: capitalize;
    }
    .da-block-picker-list li button:hover,
    .da-block-picker-list li button:focus-visible {
      background: var(--spectrum-gray-75, #f5f5f5);
      outline: none;
    }
    .da-block-picker-list li button.is-selected {
      background: var(--spectrum-blue-100, #e0f0ff);
      color: var(--spectrum-blue-700, #1473e6);
      font-weight: 600;
    }
    .da-block-picker-empty {
      padding: 16px;
      text-align: center;
      color: var(--spectrum-gray-600, #6e6e6e);
      font-size: 0.875rem;
      list-style: none;
    }
    .da-block-picker-footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--spectrum-spacing-200, 8px);
      padding-top: 12px;
      margin-top: 4px;
      border-top: 1px solid var(--spectrum-gray-200, #e0e0e0);
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);
}

function closeDialog(result) {
  dialogEl?.close();
  if (pendingResolve) {
    pendingResolve(result ?? null);
    pendingResolve = null;
  }
}

function selectItem(item, btn) {
  selectedItem = item;
  listEl?.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
  btn.classList.add('is-selected');
  if (okBtn) okBtn.disabled = false;
}

function renderList(filter) {
  if (!listEl) return;
  const term = (filter || '').toLowerCase().trim();
  const filtered = term
    ? allItems.filter((item) => item.name.toLowerCase().includes(term))
    : allItems;

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'da-block-picker-empty';
    empty.setAttribute('role', 'option');
    empty.textContent = term ? 'No blocks match your search.' : 'No blocks available.';
    listEl.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.name;
    if (selectedItem?.name === item.name) btn.classList.add('is-selected');
    btn.addEventListener('click', () => selectItem(item, btn));
    btn.addEventListener('dblclick', () => {
      selectItem(item, btn);
      closeDialog(item);
    });
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function ensureDialog() {
  if (dialogEl) return;
  injectStyles();

  dialogEl = document.createElement('dialog');
  dialogEl.id = 'da-block-picker-dialog';

  const heading = document.createElement('h3');
  heading.textContent = 'Insert block';

  const divider = document.createElement('hr');
  divider.className = 'da-block-picker-divider';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'da-block-picker-search';
  searchEl = document.createElement('input');
  searchEl.type = 'text';
  searchEl.placeholder = 'Search blocks\u2026';
  searchEl.setAttribute('autocomplete', 'off');
  searchEl.setAttribute('aria-label', 'Search blocks');
  searchWrap.appendChild(searchEl);

  listEl = document.createElement('ul');
  listEl.className = 'da-block-picker-list';
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-label', 'Available blocks');

  const footer = document.createElement('div');
  footer.className = 'da-block-picker-footer';

  const cancelBtn = document.createElement('sp-button');
  cancelBtn.setAttribute('variant', 'secondary');
  cancelBtn.setAttribute('treatment', 'outline');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => closeDialog(null));

  okBtn = document.createElement('sp-button');
  okBtn.setAttribute('variant', 'accent');
  okBtn.textContent = 'Insert';
  okBtn.disabled = true;
  okBtn.addEventListener('click', () => closeDialog(selectedItem));

  footer.append(cancelBtn, okBtn);
  dialogEl.append(heading, divider, searchWrap, listEl, footer);

  // Append inside sp-theme so Spectrum CSS custom properties are inherited
  (document.querySelector('sp-theme') ?? document.body).appendChild(dialogEl);

  searchEl.addEventListener('input', () => renderList(searchEl.value));

  // Escape closes without selection
  dialogEl.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog(null);
  });

  // Click outside the dialog box closes it
  dialogEl.addEventListener('click', (e) => {
    const { left, right, top, bottom } = dialogEl.getBoundingClientRect();
    if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) {
      closeDialog(null);
    }
  });

  // Enter confirms when a block is selected
  dialogEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && selectedItem) {
      e.preventDefault();
      closeDialog(selectedItem);
    }
  });
}

let itemsCache = null;

/**
 * Load all block variants as a flat list of { name, parsed } items.
 * Each entry in the configured blocks JSON can have multiple variants (e.g. "hero",
 * "hero (dark)") — we expand them all into one flat list so the user picks the exact
 * variant they want without any extra click.
 * @returns {Promise<{ name: string, parsed: import('prosemirror-model').Node }[]>}
 */
async function loadBlockItems() {
  if (itemsCache) return itemsCache;
  try {
    const library = await getLibraryList();
    const blocksPlugin = library?.find((p) => p.name === 'blocks');
    if (!blocksPlugin) return [];

    // loadItems is a Promise that resolves to [{ name, path, loadVariants }]
    const blocks = blocksPlugin.items
      ?? (blocksPlugin.loadItems ? await blocksPlugin.loadItems : []);
    if (!Array.isArray(blocks)) return [];

    // For each block, await its variants (each variant has { name, parsed }).
    // If a block has no usable variants (no library page, fetch error, etc.) we still
    // include it using its config name so standalone blocks always appear.  In that case
    // parsed is null and insertBlockAtSection falls back to a skeleton table.
    const variantArrays = await Promise.all(
      blocks.map(async (block) => {
        const baseName = block.name || block.title || block.key;
        try {
          const variants = block.variants ?? (block.loadVariants ? await block.loadVariants : []);
          if (Array.isArray(variants) && variants.length > 0) {
            return variants.filter((v) => v.name && v.parsed).map((v) => ({
              name: v.variants ? `${v.name} (${v.variants})` : v.name,
              parsed: v.parsed,
            }));
          }
        } catch {
          // Variant fetch failed — fall through to the base-name fallback below
        }
        // No variants: show the block by its config name; insertion uses a skeleton table
        return baseName ? [{ name: baseName, parsed: null }] : [];
      }),
    );

    itemsCache = variantArrays.flat();
    return itemsCache;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[block-picker] Failed to load block library', e?.message);
    return [];
  }
}

/**
 * Open the block picker dialog.
 * @returns {Promise<{name: string, parsed: object}|null>} Resolves with the selected
 *   variant item ({ name, parsed }), or null if cancelled.
 */
export function openBlockPicker() {
  // pendingResolve is set before any async work so Cancel/Escape always settles the
  // Promise, even if the variant fetch is still in-flight when the user dismisses.
  return new Promise((resolve) => {
    pendingResolve = resolve;

    ensureDialog();

    // Reset state
    selectedItem = null;
    if (okBtn) okBtn.disabled = true;
    if (searchEl) searchEl.value = '';

    // Show loading state while variants load
    if (listEl) {
      listEl.innerHTML = '<li class="da-block-picker-empty">Loading blocks\u2026</li>';
    }

    dialogEl.showModal();
    searchEl?.focus();

    // Load all variants (cached after first fetch) then populate the flat list
    loadBlockItems().then((items) => {
      // Only update if this invocation's dialog is still open
      if (pendingResolve !== resolve) return;
      allItems = items;
      renderList('');
    });
  });
}
