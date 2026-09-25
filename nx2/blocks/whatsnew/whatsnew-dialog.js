import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { loadEntries } from './whatsnew-parser.js';
import { setLastSeen } from './whatsnew-storage.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const closeIcon = await loadHrefSvg('/img/icons/s2-icon-close-20-n.svg');

const WHATSNEW_PATH = '/nx/fragments/guides/whats-new';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    // Tracks whether focus is being restored after pointer input.
    this._lastInputWasPointer = false;
    this._onPointerdown = () => { this._lastInputWasPointer = true; };
    this._onKeydown = () => { this._lastInputWasPointer = false; };
    window.addEventListener('pointerdown', this._onPointerdown, true);
    window.addEventListener('keydown', this._onKeydown, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._observer?.disconnect();
    window.removeEventListener('pointerdown', this._onPointerdown, true);
    window.removeEventListener('keydown', this._onKeydown, true);
  }

  _restoreFocusQuietly(el) {
    if (!el) return;
    el.focus();
    if (!this._lastInputWasPointer) return;
    el.style.outline = 'none';
    el.addEventListener('blur', () => { el.style.outline = ''; }, { once: true });
  }

  get _dialog() { return this.shadowRoot.querySelector('nx-dialog'); }

  async _loadContent() {
    const result = await loadEntries(WHATSNEW_PATH);
    const entries = result?.entries ?? [];
    // Nothing to render.
    if (entries.length === 0) {
      this.remove();
      return;
    }
    this._entries = entries;
    this._activeId = entries[0].id;
    this._publishedDate = result.publishedDate;
  }

  async updated(changed) {
    if (changed.has('_entries') && this._entries) {
      // Wait for nx-dialog layout before measuring.
      await this._dialog?.updateComplete;
      this._observeCards();
      this._positionIndicator();
      return;
    }
    if (changed.has('_activeId')) this._positionIndicator();
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
  }

  close() {
    this._dialog?.close();
  }

  _onClose() {
    if (this._publishedDate) setLastSeen(this._publishedDate);
    this._restoreFocusQuietly(this.returnFocusTo);
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
