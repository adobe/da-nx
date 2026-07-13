import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nx.js';
import { loadStyle } from '../../utils/utils.js';
import '../shared/menu/menu.js';

const { codeBase } = getConfig();
const style = await loadStyle(import.meta.url);

// Well-known, hardcoded path (not configurable) so the feedback menu works
// regardless of a consuming project's own linkBlocks config, and regardless
// of whatever content nav.js's decorateActions() finds in the nav fragment's
// action-area <li> (it only ever sees a plain "Feedback" label, no href).
const FEEDBACK_PATH = '/fragments/nav/feedback';
const ICON_HREF = `${codeBase}/img/icons/s2-icon-commenttext-20-n.svg#icon`;

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

    // loadFragment() runs the fragment's content through loadArea(), which
    // (via nx.js's decorateLink) can rewrite a same-origin hash-only href
    // like "#idea" into a path-qualified one like "/current-page#idea" once
    // the fragment is loaded on a real page. Look for the hash anywhere in
    // the href, not just at the start, so the id survives that rewrite.
    const hashIndex = href.indexOf('#');
    const id = hashIndex !== -1 ? href.slice(hashIndex + 1) : (icon || `link-${index}`);

    items.push({
      id,
      label: a.textContent.trim(),
      description: em ? em.textContent.trim() : undefined,
      icon,
      href,
    });
    return items;
  }, []);
}

// A fully-qualified http(s) URL (e.g. the Discord link) opens externally;
// anything else — a bare "#idea" hash or one rewritten to a path-qualified
// "/current-page#idea" by decorateLink() during fragment loading — is one
// of our own internal actions and opens the stub dialog instead.
function isExternalLink(href) {
  return /^https?:\/\//i.test(href);
}

/**
 * Opens the stub feedback dialog for an internal (#idea / #bug) item.
 * @param {{ id: string, label: string }} item
 */
async function openFeedbackDialog(item) {
  await import('./feedback-dialog.js');

  const dialog = document.createElement('nx-feedback-dialog');
  dialog.label = item.label;
  dialog.kind = item.id;
  document.body.append(dialog);
}

/**
 * Feedback trigger + popover menu for the nav action area. Rendered directly
 * by nav.js's decorateActions() the same way it renders <nx-profile> — from
 * a plain "Feedback" label <li>, with no href of its own (see
 * blocks/nav/nav.js) — so this component owns its own icon and fetches its
 * own menu content from the well-known FEEDBACK_PATH.
 */
class NxFeedback extends LitElement {
  static properties = {
    _items: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._loadItems();
  }

  async _loadItems() {
    const resp = await fetch(FEEDBACK_PATH);
    if (!resp.ok) return;
    const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
    const main = doc.querySelector('main');
    if (!main) return;
    this._items = parseFeedbackItems(main);
  }

  _handleSelect({ detail: { id } }) {
    const item = this._items?.find((i) => i.id === id);
    if (!item) return;

    if (!item.href || isExternalLink(item.href)) {
      if (item.href) window.open(item.href, '_blank', 'noopener,noreferrer');
      return;
    }

    openFeedbackDialog(item);
  }

  render() {
    if (!this._items) return nothing;
    return html`
      <nx-menu .items=${this._items} placement="below-end" @select=${this._handleSelect}>
        <button type="button" slot="trigger" class="nx-feedback-trigger">
          <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${ICON_HREF}"></use></svg>
          <span>Feedback</span>
        </button>
      </nx-menu>
    `;
  }
}

if (!customElements.get('nx-feedback')) customElements.define('nx-feedback', NxFeedback);
