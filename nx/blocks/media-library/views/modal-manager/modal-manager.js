import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../public/utils/svg.js';
import '../../../../public/sl/components.js';
import '../mediainfo/mediainfo.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
];

class NxModalManager extends LitElement {
  static properties = {
    _modalType: { state: true },
    _modalData: { state: true },
    _notification: { state: true },
  };

  constructor() {
    super();
    this._modalType = null;
    this._modalData = null;
    this._notification = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });

    // Listen for modal open events
    window.addEventListener('open-modal', this._onOpenModal);
    window.addEventListener('close-modal', this._onCloseModal);
    window.addEventListener('show-notification', this._onShowNotification);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('open-modal', this._onOpenModal);
    window.removeEventListener('close-modal', this._onCloseModal);
    window.removeEventListener('show-notification', this._onShowNotification);
  }

  _onOpenModal = (e) => {
    const { type, data } = e.detail;
    this._modalType = type;
    this._modalData = data;
  };

  _onCloseModal = () => {
    this._modalType = null;
    this._modalData = null;
  };

  _onShowNotification = (e) => {
    this._notification = e.detail;

    // Auto-hide notification after 3 seconds
    setTimeout(() => {
      this._notification = null;
    }, 3000);
  };

  render() {
    return html`
      ${this._modalType && this._modalData ? this.renderModal() : ''}
      ${this._notification ? this.renderNotification() : ''}
    `;
  }

  renderModal() {
    switch (this._modalType) {
      case 'details':
        return html`
          <nx-media-info
            .media=${this._modalData.media}
            .usageData=${this._modalData.usageData}
            .org=${this._modalData.org}
            .repo=${this._modalData.repo}
            .isOpen=${true}
            @close=${this._onCloseModal}
            @altTextUpdated=${this._handleAltTextUpdated}
          ></nx-media-info>
        `;
      default:
        return null;
    }
  }

  renderNotification() {
    const iconName = this._notification.type === 'danger' ? 'exclamation-triangle' : 'check-circle';
    const variant = this._notification.type || 'success';

    return html`
      <sl-alert
        variant=${variant}
        closable
        .open=${this._notification.open}
        @sl-hide=${() => { this._notification = null; }}
      >
        <sl-icon slot="icon" name=${iconName}></sl-icon>
        <div>
          <strong>${this._notification.heading || 'Info'}</strong><br>
          ${this._notification.message}
        </div>
      </sl-alert>
    `;
  }

  _handleAltTextUpdated(e) {
    // Forward the event to the main component
    window.dispatchEvent(new CustomEvent('alt-text-updated', { detail: e.detail }));
  }
}

customElements.define('nx-modal-manager', NxModalManager);
