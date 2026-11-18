import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { loadEntries } from './whatsnew-parser.js';
import { setLastSeen } from './whatsnew-storage.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);
const closeIcon = await loadHrefSvg('/img/icons/s2-icon-close-20-n.svg');

const WHATSNEW_PATH = '/fragments/guides/whats-new';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const THRESHOLDS = Array.from({ length: 11 }, (_, i) => i / 10);

// Most visible card wins; ties go to the earlier card (Map keeps document order).
export function pickMostVisible(visibleHeights) {
  const [id] = [...visibleHeights].reduce(
    (best, entry) => (entry[1] > best[1] ? entry : best),
    [undefined, 0],
  );
  return id;
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
    this.shadowRoot.adoptedStyleSheets = [style, buttonStyle];
    this._loadContent();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._observer?.disconnect();
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
    this._visibleHeights = new Map(cards.map((card) => [card.dataset.id, 0]));
    this._observer = new IntersectionObserver((observed) => {
      // Lazy-load videos when their cards enter view.
      observed.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const video = entry.target.querySelector('video[data-src]');
        if (!video) return;
        video.src = video.dataset.src;
        delete video.dataset.src;
      });
      observed.forEach((entry) => {
        const height = entry.isIntersecting ? entry.intersectionRect.height : 0;
        this._visibleHeights.set(entry.target.dataset.id, height);
      });
      this._syncActiveToScroll();
    }, { root: this.shadowRoot.querySelector('.wn-cards'), threshold: THRESHOLDS });
    cards.forEach((card) => this._observer.observe(card));
  }

  _syncActiveToScroll() {
    // Hold the clicked entry until its smooth scroll ends.
    if (this._scrollTargetId) return;
    const scroller = this.shadowRoot.querySelector('.wn-cards');
    const atBottom = scroller
      && scroller.scrollTop > 0
      && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    const lastId = this._entries.at(-1).id;
    const id = atBottom && this._visibleHeights.get(lastId) > 0
      ? lastId
      : pickMostVisible(this._visibleHeights);
    if (id) this._activeId = id;
  }

  _releaseScrollTarget() {
    this._scrollTargetId = undefined;
  }

  close() {
    this._dialog?.close();
  }

  _onClose() {
    if (this._publishedDate) setLastSeen(this._publishedDate);
    this.remove();
  }

  // Scrolls the selected entry near the top and updates active state.
  _scrollToEntry(id) {
    const card = this.shadowRoot.querySelector(`.wn-card[data-id="${id}"]`);
    if (!card) return;
    this._activeId = id;
    this._scrollTargetId = id;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  render() {
    if (!this._entries) return nothing;
    return html`
      <nx-dialog class="wn-dialog" @close=${this._onClose}>
        <div class="wn-body">
          <button type="button" class="wn-close nx-action-btn-icon" aria-label="Close" @click=${this.close}>
            ${closeIcon}
          </button>
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
            <div
              class="wn-cards"
              @scrollend=${this._releaseScrollTarget}
              @wheel=${{ handleEvent: () => this._releaseScrollTarget(), passive: true }}
              @touchstart=${{ handleEvent: () => this._releaseScrollTarget(), passive: true }}
              @pointerdown=${this._releaseScrollTarget}
              @keydown=${this._releaseScrollTarget}
            >
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
