import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';
import { parseWhatsNewEntries } from './parse-whatsnew.js';
import { setWhatsNewLastSeen } from '../../utils/whatsNewFlags.js';

const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);
const closeIcon = await loadHrefSvg(`${ICONS_BASE}S2_Icon_Close_20_N.svg`);

// Well-known, hardcoded fragment, same convention as welcome-dialog.js's
// WELCOME_PATH: an absolute URL to da-live's own publish host so this works
// regardless of a consuming project's proxy/config, and regardless of which
// site the "What's new" nav item was authored on.
// TODO(new1140): temporarily .aem.page (preview, needs auth) instead of
// .aem.live (published, public) — the real content isn't published yet.
// Revert to .aem.live before merging; .page won't work for real end users.
const WHATSNEW_PATH = 'https://main--da-live--adobe.aem.page/nx/fragments/guides/whats-new';

/**
 * Two-pane "what's new" dialog: a left-hand table of contents and a
 * scrollable right-hand feed of cards (image, title, body, optional CTA),
 * one per entry authored in the WHATSNEW_PATH fragment. Clicking a TOC item
 * scrolls the matching card into view; the active TOC item tracks whichever
 * card is currently in view via IntersectionObserver.
 *
 * Opened two ways (see whatsnew.js): manually, by clicking the nav trigger,
 * or automatically when the fragment's newest entry is newer than what the
 * user last saw. Either way, loading the content here marks it as seen —
 * this component is the single owner of that state.
 */
class NxWhatsNewDialog extends LitElement {
  static properties = {
    _entries: { state: true },
    _activeId: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttonStyle];
    this._loadContent();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._observer?.disconnect();
  }

  get _dialog() { return this.shadowRoot.querySelector('dialog'); }

  async _loadContent() {
    const fragment = await loadFragment(WHATSNEW_PATH);
    const entries = fragment ? parseWhatsNewEntries(fragment) : [];
    // No content, or content with no valid entries — nothing to show.
    if (entries.length === 0) {
      this.remove();
      return;
    }
    this._entries = entries;
    this._activeId = entries[0].id;
    setWhatsNewLastSeen(entries[0].id);
  }

  updated(changed) {
    if (changed.has('_entries') && this._entries && !this._dialog.open) {
      this._dialog.showModal();
      this._observeCards();
    }
  }

  _observeCards() {
    const cards = [...this.shadowRoot.querySelectorAll('.wn-card')];
    this._observer = new IntersectionObserver((observed) => {
      const visible = observed.filter((entry) => entry.isIntersecting);
      if (visible.length === 0) return;
      visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      this._activeId = visible[0].target.dataset.id;
    }, { root: this.shadowRoot.querySelector('.wn-cards'), threshold: [0.25, 0.5, 0.75] });
    cards.forEach((card) => this._observer.observe(card));
  }

  close() {
    if (!this._dialog?.open) return;
    this._dialog.close();
  }

  _onCancel(e) {
    e.preventDefault();
    this.close();
  }

  _onBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    this.close();
  }

  _onClose() {
    this.remove();
    window.dispatchEvent(new CustomEvent('nx-whatsnew-closed'));
  }

  // Scrolls so the card's image sits 40px below the top of the scroll area,
  // rather than flush against it.
  _scrollToEntry(id) {
    const card = this.shadowRoot.querySelector(`.wn-card[data-id="${id}"]`);
    const container = this.shadowRoot.querySelector('.wn-cards');
    if (!card || !container) return;
    const target = card.querySelector('.wn-card-image') ?? card;
    const offset = target.getBoundingClientRect().top
      - container.getBoundingClientRect().top + container.scrollTop - 40;
    container.scrollTo({ top: offset, behavior: 'smooth' });
  }

  render() {
    if (!this._entries) return nothing;
    return html`
      <dialog @cancel=${this._onCancel} @click=${this._onBackdropClick} @close=${this._onClose}>
        <div class="wn-panel">
          <button type="button" class="wn-close" aria-label="Close" @click=${this.close}>
            ${closeIcon}
          </button>
          <nav class="wn-toc" aria-label="What's new sections">
            <h2 class="wn-toc-title">What's new</h2>
            <ul class="wn-toc-list">
              ${this._entries.map((entry) => html`
                <li>
                  <button
                    type="button"
                    class="wn-toc-item"
                    aria-current=${this._activeId === entry.id ? 'true' : nothing}
                    @click=${() => this._scrollToEntry(entry.id)}
                  >
                    <span class="wn-toc-bar" aria-hidden="true"></span>
                    <span class="wn-toc-label">${entry.title}</span>
                  </button>
                </li>
              `)}
            </ul>
          </nav>
          <div class="wn-cards-panel">
            <div class="wn-cards">
              ${this._entries.map((entry) => html`
                <article class="wn-card" data-id=${entry.id}>
                  <div class="wn-card-image">${entry.picture}</div>
                  <h3 class="wn-card-title">${entry.title}</h3>
                  <p class="wn-card-body">${entry.body}</p>
                  <button
                    type="button"
                    class="nx-btn-accent wn-card-cta"
                    ?disabled=${!entry.href}
                    @click=${() => window.open(entry.href, '_blank', 'noopener,noreferrer')}
                  >Try it now</button>
                </article>
              `)}
            </div>
          </div>
        </div>
      </dialog>
    `;
  }
}

if (!customElements.get('nx-whatsnew-dialog')) {
  customElements.define('nx-whatsnew-dialog', NxWhatsNewDialog);
}
