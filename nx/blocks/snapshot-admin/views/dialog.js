import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../../nx2/public/utils/styles.js';
import { getConfig } from '../../../../nx2/scripts/nx.js';

const { nxBase, codeBase } = getConfig();
const sl = await getStyle(`${nxBase}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

const CLOSE_ICON = `${codeBase}/img/icons/s2-icon-close-20-n.svg#icon`;

class NxDialog extends LitElement {
  static properties = { details: { attribute: false } };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, style];
  }

  updated(props) {
    if (props.has('details') && this.details) {
      if (this.details.open) {
        this._dialog.showModal();
      } else {
        this._dialog.close();
      }
    }
  }

  handleAction(value) {
    const opts = { bubbles: true, composed: true, detail: value };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
    this._dialog.close();
  }

  get _dialog() {
    return this.shadowRoot.querySelector('sl-dialog');
  }

  renderActions() {
    if (this.details?.actions) {
      return this.details.actions.map((action) => html`
        <sl-button
          class="${action.variant || 'default'}"
          @click=${() => this.handleAction(action.value)}
        >
          ${action.label}
        </sl-button>
      `);
    }
    return html`<sl-button @click=${() => this.handleAction()}>OK</sl-button>`;
  }

  render() {
    return html`
      <sl-dialog class="nx-snapshots-error">
        <div class="nx-dialog" style=${this.details?.width ? `width:${this.details.width}` : nothing}>
          <div class="nx-dialog-header-area">
            <p class="sl-heading-l">${this.details?.heading}</p>
            <button
              class="nx-dialog-close-btn"
              @click=${() => this.handleAction()}
              aria-label="Close dialog">
              <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${CLOSE_ICON}"></use></svg>
            </button>
          </div>
          <hr/>
          <div class="nx-dialog-content-area">
            <p class="sl-body-s">${this.details?.message}</p>
          </div>
          <div class="nx-dialog-action-group">
            ${this.renderActions()}
          </div>
        </div>
      </sl-dialog>
    `;
  }
}

customElements.define('nx-dialog', NxDialog);
