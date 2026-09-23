import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';
import { parseWhatsNewEntries } from './parse-whatsnew.js';
import { setWhatsNewLastSeenDate } from './whatsnew-flags.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const closeIcon = await loadHrefSvg(`${ICONS_BASE}S2_Icon_Close_20_N.svg`);

// Relative path, resolves against whatever host serves the current page.
const WHATSNEW_PATH = '/nx/fragments/guides/whats-new';

// Tracks last input type, to skip the ring browsers show by default on any scripted .focus() call.
let lastInputWasPointer = false;
window.addEventListener('pointerdown', () => { lastInputWasPointer = true; }, true);
window.addEventListener('keydown', () => { lastInputWasPointer = false; }, true);

function restoreFocusQuietly(el) {
  if (!el) return;
  el.focus();
  if (!lastInputWasPointer) return;
  el.style.outline = 'none';
  el.addEventListener('blur', () => { el.style.outline = ''; }, { once: true });
}

/**
 * Two-pane "what's new" dialog (toc + scrollable cards), wrapping the
 * shared nx-dialog. Opened from whatsnew.js; marks content seen and fires
 * nx-whatsnew-all-seen once every entry has actually been viewed.
 */
class NxWhatsNewDialog extends LitElement {
  static properties = {
    _entries: { state: true },
    _activeId: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._loadContent();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._observer?.disconnect();
    this._resizeObserver?.disconnect();
  }

  get _dialog() { return this.shadowRoot.querySelector('nx-dialog'); }

  async _loadContent() {
    let fragment;
    try {
      fragment = await loadFragment(WHATSNEW_PATH);
    } catch {
      this.remove();
      return;
    }
    const entries = fragment ? parseWhatsNewEntries(fragment) : [];
    // No content, or content with no valid entries — nothing to show.
    if (entries.length === 0) {
      this.remove();
      return;
    }
    this._entries = entries;
    this._activeId = entries[0].id;
    this._publishedDate = fragment.publishedDate;
    this._viewedIds = new Set();
  }

  async updated(changed) {
    if (changed.has('_entries') && this._entries) {
      // nx-dialog's .panel (which .wn-body is positioned against) may not exist yet.
      await this._dialog?.updateComplete;
      this._observeCards();
      this._ensureScrollRoom();
      this._positionIndicator();
      this._trackViewed(this._activeId);
      return;
    }
    if (changed.has('_activeId')) {
      this._positionIndicator();
      this._trackViewed(this._activeId);
    }
  }

  // Marks an entry seen once active; once all are seen, persists the date and clears the dot.
  _trackViewed(id) {
    if (!id || this._viewedIds.has(id)) return;
    this._viewedIds.add(id);
    if (this._viewedIds.size < this._entries.length) return;
    if (this._publishedDate) setWhatsNewLastSeenDate(this._publishedDate);
    window.dispatchEvent(new CustomEvent('nx-whatsnew-all-seen'));
  }

  // Computes trailing room so the last card can scroll to the 40px-from-top target.
  _ensureScrollRoom() {
    const container = this.shadowRoot.querySelector('.wn-cards');
    const cards = this.shadowRoot.querySelectorAll('.wn-card');
    const lastCard = cards[cards.length - 1];
    if (!container || !lastCard) return;
    const needed = container.clientHeight - 40 - lastCard.offsetHeight;
    container.style.paddingBottom = `${Math.max(60, needed)}px`;
  }

  // Recomputes scroll room when the last card's size changes (its image loads asynchronously).
  _watchLastCardSize(lastCard) {
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => this._ensureScrollRoom());
    this._resizeObserver.observe(lastCard);
  }

  // Single shared indicator that slides, rather than each item toggling its own bar.
  _positionIndicator() {
    const indicator = this.shadowRoot.querySelector('.wn-toc-indicator');
    const active = this.shadowRoot.querySelector('.wn-toc-item[aria-current="true"]');
    if (!indicator || !active) return;
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.height = `${active.offsetHeight}px`;
  }

  _observeCards() {
    const cards = [...this.shadowRoot.querySelectorAll('.wn-card')];
    this._observer = new IntersectionObserver((observed) => {
      // Skip while a click-triggered scroll is animating, avoids flipping _activeId back.
      if (this._suppressObserver) return;
      const visible = observed.filter((entry) => entry.isIntersecting);
      if (visible.length === 0) return;
      visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      this._activeId = visible[0].target.dataset.id;
    }, { root: this.shadowRoot.querySelector('.wn-cards'), threshold: [0.25, 0.5, 0.75, 1] });
    cards.forEach((card) => this._observer.observe(card));
    if (cards.length > 0) this._watchLastCardSize(cards[cards.length - 1]);
  }

  close() {
    this._dialog?.close();
  }

  _onClose() {
    restoreFocusQuietly(this.returnFocusTo);
    this.remove();
  }

  // Scrolls to 40px below the top; sets _activeId directly (short cards may skip the observer).
  _scrollToEntry(id) {
    const card = this.shadowRoot.querySelector(`.wn-card[data-id="${id}"]`);
    const container = this.shadowRoot.querySelector('.wn-cards');
    if (!card || !container) return;
    this._activeId = id;
    const target = card.querySelector('.wn-card-image') ?? card;
    const offset = target.getBoundingClientRect().top
      - container.getBoundingClientRect().top + container.scrollTop - 40;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const clamped = Math.max(0, Math.min(offset, maxScroll));
    // Skip suppressing when there's no real scroll delta — scrollend won't fire to clear it.
    if (Math.abs(clamped - container.scrollTop) >= 1) {
      this._suppressObserver = true;
      const clear = () => { this._suppressObserver = false; };
      container.addEventListener('scrollend', clear, { once: true });
      // Backstop in case scrollend never fires.
      setTimeout(clear, 500);
    }
    container.scrollTo({ top: clamped, behavior: 'smooth' });
  }

  render() {
    if (!this._entries) return nothing;
    return html`
      <nx-dialog class="wn-dialog" @close=${this._onClose}>
        <button type="button" class="wn-close" aria-label="Close" @click=${this.close}>
          ${closeIcon}
        </button>
        <div class="wn-body">
          <nav class="wn-toc" aria-label="What's new sections">
            <div class="wn-toc-scroll">
              <h2 class="wn-toc-title" tabindex="-1" autofocus>What's new</h2>
              <ul class="wn-toc-list">
                <li class="wn-toc-indicator" aria-hidden="true"></li>
                ${this._entries.map((entry) => html`
                  <li>
                    <button
                      type="button"
                      class="wn-toc-item"
                      aria-current=${this._activeId === entry.id ? 'true' : nothing}
                      @click=${() => this._scrollToEntry(entry.id)}
                    >
                      <span class="wn-toc-label">${entry.title}</span>
                    </button>
                  </li>
                `)}
              </ul>
            </div>
          </nav>
          <div class="wn-cards-panel">
            <div class="wn-cards">
              ${this._entries.map((entry) => html`
                <article class="wn-card" data-id=${entry.id}>
                  <div class="wn-card-image">${entry.picture}</div>
                  <h3 class="wn-card-title">${entry.title}</h3>
                  <p class="wn-card-body">${entry.body}</p>
                </article>
              `)}
            </div>
          </div>
        </div>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-whatsnew-dialog')) {
  customElements.define('nx-whatsnew-dialog', NxWhatsNewDialog);
}
