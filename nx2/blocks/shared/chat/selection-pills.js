import { html, nothing } from 'da-lit';
import { getConfig } from '../../../scripts/nx.js';
import { pillIconName } from '../utils/icons.js';

const { codeBase } = getConfig();

export function renderSelectionPills(msg) {
  const contextItem = (name, iconName) => html`
    <li class="selection-context-item">
      <svg class="selection-icon" viewBox="0 0 20 20" aria-hidden="true">
        <use href="${codeBase}/img/icons/${iconName}.svg#icon"></use>
      </svg>
      <span>${name}</span>
    </li>`;

  const items = [
    ...(msg.selectionContext ?? []).map((sc) => {
      const name = sc.blockName || 'Selection';
      return contextItem(name, pillIconName(sc.type, name));
    }),
    ...(msg.attachmentsMeta ?? []).map(({ fileName }) => (
      contextItem(fileName, pillIconName(undefined, fileName))
    )),
  ];
  if (items.length === 1) {
    return html`<ul class="selection-context-list" aria-label="Attached context">${items[0]}</ul>`;
  }
  if (items.length > 1) {
    return html`<details class="selection-context">
        <summary><span class="selection-context-count">${items.length} items added</span></summary>
        <ul class="selection-context-list">${items}</ul>
      </details>`;
  }
  return nothing;
}
