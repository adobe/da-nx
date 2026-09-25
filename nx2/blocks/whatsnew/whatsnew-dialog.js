import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { parseEntries } from './whatsnew-parser.js';
import { setLastSeen } from './whatsnew-storage.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const closeIcon = await loadHrefSvg('/img/icons/s2-icon-close-20-n.svg');

const WHATSNEW_PATH = '/nx/fragments/guides/whats-new';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tracks whether focus is being restored after pointer input.
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
 * Two-pane "what's new" dialog.
 * Marks content seen on close.
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
    const entries = fragment ? parseEntries(fragment) : [];
    // Nothing to render.
    if (entries.length === 0) {
      this.remove();
      return;
    }
    this._entries = entries;
    this._activeId = entries[0].id;
    this._publishedDate = fragment.publishedDate;
  }

  async updated(changed) {
    if (changed.has('_entries') && this._entries) {
      // Wait for nx-dialog layout before measuring.
      await this._dialog?.updateComplete;
      this._observeCards();
      this._ensureScrollRoom();
      this._positionIndicator();
      return;
    }
    if (changed.has('_activeId')) this._positionIndicator();
  }

  // Adds trailing room so the last card can align near the top.
  _ensureScrollRoom() {
    const container = this.shadowRoot.querySelector('.wn-cards');
    const cards = this.shadowRoot.querySelectorAll('.wn-card');
    const lastCard = cards[cards.length - 1];
    if (!container || !lastCard) return;
    // Mobile uses .wn-body for scrolling.
    if (window.matchMedia('(width < 600px)').matches) {
      container.style.paddingBottom = '';
      return;
    }
    const needed = container.clientHeight - 40 - lastCard.offsetHeight;
    container.style.paddingBottom = `${Math.max(60, needed)}px`;
  }

  // Recomputes scroll room when the last card changes size.
  _watchLastCardSize(lastCard) {
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      this._ensureScrollRoom();
    });
    this._resizeObserver.observe(lastCard);
  }

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
      // Lazy-load videos when their cards enter view.
      observed.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const video = entry.target.querySelector('video[data-src]');
        if (!video) return;
        video.src = video.dataset.src;
        delete video.dataset.src;
      });
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
    if (this._publishedDate) setLastSeen(this._publishedDate);
    restoreFocusQuietly(this.returnFocusTo);
    this.remove();
  }

  // Scrolls the selected entry near the top and updates active state.
  _scrollToEntry(id) {
    const card = this.shadowRoot.querySelector(`.wn-card[data-id="${id}"]`);
    if (!card) return;
    this._activeId = id;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
                  <div class="wn-card-image">
                    ${entry.videoSrc ? html`
                      <video
                        data-src=${entry.videoSrc}
                        ?autoplay=${!prefersReducedMotion}
                        loop
                        muted
                        playsinline
                      ></video>
                    ` : entry.picture}
                  </div>
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
