import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';
import { parseWhatsNewEntries } from './parse-whatsnew.js';
import { setWhatsNewLastSeenDate } from './whatsnew-flags.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const closeIcon = await loadHrefSvg(`${ICONS_BASE}S2_Icon_Close_20_N.svg`);

// Well-known, hardcoded fragment path — relative so it resolves against
// whatever host is actually serving the current page, same as any other
// project reusing nx2 as its shell would get its own copy at this path.
const WHATSNEW_PATH = '/nx/fragments/guides/whats-new';

// Browsers show a focus-visible ring on any script-driven .focus() call,
// even one restoring focus after a plain mouse click closed the dialog —
// they can't tell it apart from a keyboard/screen-reader interaction. Track
// the last input type so a mouse-triggered close can restore real focus
// (screen readers still announce it correctly) without the visible ring;
// a genuine keyboard interaction still gets the ring as normal.
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
 * Two-pane "what's new" dialog: a left-hand table of contents and a
 * scrollable right-hand feed of cards (image, title, body), one per entry
 * authored in the WHATSNEW_PATH fragment. Clicking a TOC item scrolls the
 * matching card into view; the active TOC item tracks whichever card is
 * currently in view via IntersectionObserver.
 *
 * Wraps the shared nx-dialog (see shared/dialog/dialog.js) rather than a
 * raw <dialog> — nx-dialog owns the backdrop, ESC/cancel handling, and
 * showModal() lifecycle; this component just slots its own two-pane body
 * and close button into it, with sizing/padding/border overridden via
 * nx-dialog's CSS custom properties.
 *
 * Opened two ways (see whatsnew.js): manually, by clicking the nav trigger,
 * or automatically when the fragment's published-date is newer than what
 * the user last saw. Content only gets marked as seen (and
 * nx-whatsnew-all-seen fires) once every entry has actually been viewed —
 * scrolled to or clicked in the toc — not just on load or close.
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
      // nx-dialog is a separate custom element that may not have rendered
      // its own shadow DOM yet at this point — .wn-body is absolutely
      // positioned against its .panel, so measuring anything here (toc
      // item offsets, card heights) before it's ready reads as zero.
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

  // Marks an entry seen the first time it becomes active (scrolled to or
  // clicked in the toc — see _observeCards/_scrollToEntry). Once every
  // entry has been seen at least once, persist the published-date (so it
  // won't auto-open again) and tell the nav trigger to clear its dot —
  // closing early with entries still unseen leaves both untouched, so the
  // dot and auto-open come back next time.
  _trackViewed(id) {
    if (!id || this._viewedIds.has(id)) return;
    this._viewedIds.add(id);
    if (this._viewedIds.size < this._entries.length) return;
    if (this._publishedDate) setWhatsNewLastSeenDate(this._publishedDate);
    window.dispatchEvent(new CustomEvent('nx-whatsnew-all-seen'));
  }

  // A static trailing padding can't guarantee the last card can scroll all
  // the way up to the 40px-from-top target _scrollToEntry aims for — the
  // browser clamps scrollTop at scrollHeight - clientHeight, so without
  // enough room after the last card, it clamps short and the last card
  // never fully reaches that position. Compute exactly enough room instead
  // of guessing a fixed px value.
  _ensureScrollRoom() {
    const container = this.shadowRoot.querySelector('.wn-cards');
    const cards = this.shadowRoot.querySelectorAll('.wn-card');
    const lastCard = cards[cards.length - 1];
    if (!container || !lastCard) return;
    const needed = container.clientHeight - 40 - lastCard.offsetHeight;
    container.style.paddingBottom = `${Math.max(60, needed)}px`;
  }

  // The last card's real height can still change after this first runs —
  // its image loads asynchronously and nx-dialog (a separate custom
  // element) may not have finished its own first render/layout yet either
  // — so keep recomputing whenever the last card's rendered size changes,
  // instead of trusting a single measurement taken right after entries load.
  _watchLastCardSize(lastCard) {
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => this._ensureScrollRoom());
    this._resizeObserver.observe(lastCard);
  }

  // Single shared indicator sliding between items, rather than each item
  // toggling its own bar on/off (which reads as a blink, not a move).
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
      // Ignore updates while a click-triggered scroll is still animating —
      // short cards can both be partially visible mid-scroll, and this
      // "most-visible card wins" logic can otherwise flip _activeId back
      // to the wrong card before the scroll settles on the clicked one.
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

  // Scrolls so the card's image sits 40px below the top of the scroll area,
  // rather than flush against it. Sets _activeId directly rather than
  // waiting on the scroll observer to infer it — cards can be short enough
  // that the observer's visibility thresholds don't reliably cross during
  // a click-triggered scroll.
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
    // scrollend never fires when the clamped target is where we already are
    // (e.g. clicking the already-active entry) — suppressing the observer
    // with nothing to clear it would leave scrollspy stuck off for good.
    if (Math.abs(clamped - container.scrollTop) >= 1) {
      this._suppressObserver = true;
      const clear = () => { this._suppressObserver = false; };
      container.addEventListener('scrollend', clear, { once: true });
      // Backstop in case scrollend doesn't fire (unsupported browser, or the
      // scroll gets interrupted in a way that never settles).
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
