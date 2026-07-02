import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import '../shared/menu/menu.js';

const NX_BASE = new URL('../../', import.meta.url).href.replace(/\/$/, '');
const style = await loadStyle(import.meta.url);

export function parseFeedbackItems(fragment) {
  // Descendant search (not :scope > p): loadFragment() wraps the authored
  // content div inside its own "fragment-content" div, so rows can be nested
  // one level deeper than fragment's direct children. Plain descendant search
  // works for both that shape and a bare div passed directly in tests.
  const rows = [...fragment.querySelectorAll('p')];
  return rows.reduce((items, p, index) => {
    const a = p.querySelector('a');
    if (!a) return items;

    const iconSpan = a.querySelector('span.icon');
    const iconClass = iconSpan
      ? [...iconSpan.classList].find((cls) => cls !== 'icon' && cls.startsWith('icon-'))
      : undefined;
    const icon = iconClass ? iconClass.slice('icon-'.length) : undefined;

    const href = a.getAttribute('href') || '';
    const em = p.querySelector('em');

    items.push({
      id: href.startsWith('#') ? href.slice(1) : (icon || `link-${index}`),
      label: a.textContent.trim(),
      description: em ? em.textContent.trim() : undefined,
      icon,
      href,
    });
    return items;
  }, []);
}

class NxFeedbackMenu extends LitElement {
  static properties = {
    path: { attribute: false },
    _items: { state: true },
    _loadFailed: { state: true },
    _dialog: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._loadItems();
  }

  async _loadItems() {
    const fragment = await loadFragment(this.path);
    if (!fragment) {
      this._loadFailed = true;
      return;
    }
    this._items = parseFeedbackItems(fragment);
  }

  async _handleSelect({ detail: { id } }) {
    const item = this._items?.find((i) => i.id === id);
    if (!item) return;

    if (item.href.startsWith('#')) {
      await Promise.all([
        import('../shared/dialog/dialog.js'),
        import(`${NX_BASE}/public/sl/components.js`),
      ]);
      this._dialog = { id: item.id, titleText: item.label };
      return;
    }

    if (item.href) window.open(item.href, '_blank', 'noopener,noreferrer');
  }

  _closeDialog() {
    this._dialog = undefined;
  }

  _submitDialog() {
    // TODO: POST to feedback endpoint in a follow-up iteration.
    this._dialog = undefined;
  }

  _renderDialog() {
    if (!this._dialog) return nothing;
    return html`
      <nx-dialog title=${this._dialog.titleText} @close=${this._closeDialog}>
        <textarea class="feedback-textarea" autofocus placeholder="Tell us more..."></textarea>
        <sl-button slot="actions" @click=${this._closeDialog}>Cancel</sl-button>
        <sl-button slot="actions" @click=${this._submitDialog}>Submit</sl-button>
      </nx-dialog>
    `;
  }

  render() {
    return html`
      <nx-menu .items=${this._items ?? []} placement="below-end" @select=${this._handleSelect}>
        <slot name="trigger"></slot>
      </nx-menu>
      ${this._renderDialog()}
    `;
  }
}

if (!customElements.get('nx-feedback-menu')) customElements.define('nx-feedback-menu', NxFeedbackMenu);

/**
 * Wraps an already-decorated dialog auto-block button (see
 * blocks/dialog/dialog.js, which turns a hash-linked fragment anchor into a
 * plain button) in a <nx-feedback-menu>, so it opens a popover menu
 * (nx-menu) instead of the generic single-dialog behavior nav.js's
 * decorateActions wires onto every other data-pathname button.
 *
 * Called directly from nav.js — not registered as an auto-block itself —
 * so it works regardless of any consuming project's own linkBlocks config.
 * @param {HTMLButtonElement} button
 */
export function attachFeedbackMenu(button) {
  button.classList.add('nx-feedback');
  button.setAttribute('slot', 'trigger');

  const wrapper = document.createElement('nx-feedback-menu');
  wrapper.path = button.dataset.pathname;

  button.replaceWith(wrapper);
  wrapper.append(button);
}
