import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nx.js';
import { loadStyle } from '../../utils/utils.js';
import { fetchPublishedDate } from '../whatsnew/whatsnew-parser.js';
import { getLastSeen } from '../whatsnew/whatsnew-storage.js';
import '../shared/menu/menu.js';

const { codeBase } = getConfig();
const [buttonStyle, style] = await Promise.all([
  loadStyle(new URL('../../styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

// Well-known, hardcoded path (not configurable) so the help and feedback menu works
// regardless of a consuming project's own linkBlocks config, and regardless
// of whatever content nav.js's decorateActions() finds in the nav fragment's
// action-area <li> (a component name with no href).
const HELP_AND_FEEDBACK_PATH = '/fragments/nav/help-and-feedback';
const ICON_HREF = `${codeBase}/img/icons/S2_Icon_Lightbulb_20_N.svg#lightbulb`;
const WHATSNEW_PATH = '/fragments/guides/whats-new';

export function parseHelpAndFeedbackItems(fragment) {
  const rows = [...fragment.querySelectorAll('p, hr')];
  let previousSection;
  const items = rows.reduce((result, p, index) => {
    if (p.matches('hr')) {
      if (result.length && !result.at(-1).divider) result.push({ divider: true });
      return result;
    }
    const a = p.querySelector('a');
    if (!a) return result;
    const section = p.closest('.section, div');
    if (previousSection && section !== previousSection && !result.at(-1)?.divider) {
      result.push({ divider: true });
    }
    previousSection = section;

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

    result.push({
      id,
      label: a.textContent.trim(),
      description: em ? em.textContent.trim() : undefined,
      icon,
      href,
    });
    return result;
  }, []);
  if (items.at(-1)?.divider) items.pop();
  return items;
}

function getAction(item) {
  const url = new URL(item.href, window.location.href);
  if (url.origin !== window.location.origin) return undefined;
  if (url.pathname === WHATSNEW_PATH) return 'whatsnew';
  if (url.pathname === '/fragments/nav/help') return 'legal';
  const action = url.hash.slice(1);
  return ['idea', 'bug', 'whatsnew', 'legal'].includes(action) ? action : undefined;
}

/**
 * Opens the stub feedback dialog for an internal (#idea / #bug) item.
 * @param {{ id: string, label: string }} item
 */
async function openFeedbackDialog(item) {
  await import('../feedback/feedback-dialog.js');

  const dialog = document.createElement('nx-feedback-dialog');
  dialog.label = item.label;
  dialog.kind = item.id;
  document.body.append(dialog);
}

/**
 * Help and feedback trigger + popover menu for the nav action area. Rendered directly
 * by nav.js's decorateActions() the same way it renders <nx-profile> — from
 * a plain "help-and-feedback" label <li>, with no href of its own (see
 * blocks/nav/nav.js) — so this component owns its own icon and fetches its
 * own menu content from the well-known HELP_AND_FEEDBACK_PATH.
 */
export default class NxHelpAndFeedback extends LitElement {
  static properties = {
    _items: { state: true },
    _hasUnseen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyle, style];
    this._loadItems();
    this._checkUnseen();
  }

  async _loadItems() {
    this._items = undefined;
    try {
      const resp = await fetch(HELP_AND_FEEDBACK_PATH);
      if (!resp.ok) throw new Error(`Help and feedback fragment returned ${resp.status}`);
      const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
      const main = doc.querySelector('main');
      if (!main) throw new Error('Help and feedback fragment has no main content');
      this._items = parseHelpAndFeedbackItems(main);
    } catch (error) {
      getConfig().log('Unable to load help and feedback menu.', error);
    }
  }

  async _checkUnseen() {
    const publishedDate = await fetchPublishedDate(WHATSNEW_PATH);
    const lastSeen = getLastSeen();
    this._hasUnseen = Boolean(publishedDate && (!lastSeen || lastSeen < publishedDate));
  }

  get _menuItems() {
    return this._items?.map((item) => (
      !item.divider && getAction(item) === 'whatsnew'
        ? {
          ...item,
          trailing: this._hasUnseen ? { type: 'dot', color: 'var(--s2-blue-900)' } : undefined,
        }
        : item
    ));
  }

  async _handleSelect({ detail: { id } }) {
    const item = this._items?.find((i) => !i.divider && i.id === id);
    if (!item) return;
    const trigger = this.shadowRoot.querySelector('button[slot="trigger"]');
    trigger?.focus();
    try {
      const action = getAction(item);
      if (action === 'whatsnew') {
        await import('../whatsnew/whatsnew-dialog.js');
        if (document.querySelector('nx-whatsnew-dialog')) return;
        const dialog = document.createElement('nx-whatsnew-dialog');
        dialog.addEventListener('close', () => { this._hasUnseen = false; }, { once: true });
        document.body.append(dialog);
        return;
      }
      if (action === 'legal') {
        const { openLegalNotices } = await import('../../utils/legal-notices.js');
        await openLegalNotices();
        return;
      }
      if (action === 'idea' || action === 'bug') {
        await openFeedbackDialog({ ...item, id: action });
        return;
      }
      window.open(item.href, '_blank', 'noopener,noreferrer');
    } catch (error) {
      getConfig().log(`Unable to open support menu item: ${id}`, error);
    }
  }

  render() {
    if (!this._items?.some((item) => !item.divider && item.label && item.href)) return nothing;
    return html`
      <nx-menu .items=${this._menuItems} placement="below-end" @select=${this._handleSelect} size="m">
        <button type="button" slot="trigger" class="nx-action-btn-icon" aria-label="Help and feedback" title="Help and feedback">
          <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${ICON_HREF}"></use></svg>
        </button>
      </nx-menu>
    `;
  }
}

if (!customElements.get('nx-help-and-feedback')) {
  customElements.define('nx-help-and-feedback', NxHelpAndFeedback);
}
