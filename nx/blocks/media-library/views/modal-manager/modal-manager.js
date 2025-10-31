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
    window.addEventListener('open-modal', this.handleOpenModal);
    window.addEventListener('close-modal', this.handleCloseModal);
    window.addEventListener('show-notification', this.handleShowNotification);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('open-modal', this.handleOpenModal);
    window.removeEventListener('close-modal', this.handleCloseModal);
    window.removeEventListener('show-notification', this.handleShowNotification);
  }

  handleOpenModal = (e) => {
    const { type, data } = e.detail;
    this._modalType = type;
    this._modalData = data;
  };

  handleCloseModal = () => {
    this._modalType = null;
    this._modalData = null;
  };

  handleShowNotification = (e) => {
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
            .isScanning=${this._modalData.isScanning}
            .isOpen=${true}
            @close=${this.handleCloseModal}
            @altTextUpdated=${this.handleAltTextUpdated}
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
          <strong>${this._notification.heading || 'Info'}. </strong>
          ${this._notification.message}
        </div>
      </sl-alert>
    `;
  }

  handleAltTextUpdated(e) {
    // Forward the event to the main component
    window.dispatchEvent(new CustomEvent('alt-text-updated', { detail: e.detail }));
  }
}

customElements.define('nx-modal-manager', NxModalManager);
