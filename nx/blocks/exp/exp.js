// eslint-disable-next-line import/no-unresolved
import { html, LitElement, nothing } from 'da-lit';
import { getConfig, loadStyle } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';
import {
  deleteExperiment,
  getIsAllowed,
  getDefaultData,
  getErrors,
  observeDetailsEdited,
  processDetails,
  saveDetails,
} from './utils.js';

// Super Lite
import '../../public/sl/components.js';

// Sub-components
import './views/login.js';
import './views/view.js';
import './views/edit.js';
import './components/action-bar.js';

const { nxBase } = getConfig();

const sl = await getStyle(`${nxBase}/public/sl/styles.css`);
const exp = await getStyle(import.meta.url);

const ICONS = [`${nxBase}/public/icons/S2_Icon_Add_20_N.svg`];

class NxExp extends LitElement {
  static properties = {
    port: { attribute: false },
    _ims: { state: true },
    _isAllowed: { state: true },
    _view: { state: true },
    _page: { state: true },
    _details: { state: true },
    _errors: { state: true },
    _status: { state: true },
    _modified: { state: true },
    _alertMessage: { state: true, type: Object },
  };

  async connectedCallback() {
    super.connectedCallback();
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.shadowRoot.adoptedStyleSheets = [sl, exp];
  }

  /**
   * Handle the profile web component loading.
   *
   * We should show nothing until this data is loaded.
   *
   * @param {Event} e the event
   */
  async handleProfileLoad(e) {
    // This will have the entire profile or be anon.
    this._ims = e.detail;

    const { ok } = await getIsAllowed(this._page);
    this._isAllowed = ok;
  }

  async handleMessage({ data }) {
    const { page, experiment } = data;
    if (page) {
      // Only load the profile (and IMS) after we get the page data
      await import('../profile/profile.js');
      this._page = data.page;
    }
    if (experiment) {
      const expData = experiment.name ? experiment : getDefaultData(this._page);
      const details = processDetails(expData);
      this._details = observeDetailsEdited(details, () => { this._modified = true; });
      this._view = expData.name ? 'view' : 'edit';
    }
  }

  update(props) {
    if (props.has('port') && this.port) {
      // Post a message saying this side is ready.
      this.port.postMessage({ ready: true });
      // Wait for more messages from the other side.
      this.port.onmessage = (e) => { this.handleMessage(e); };
    }

    super.update();
  }

  setStatus(text, type) {
    if (!text) {
      this._status = null;
    } else {
      this._status = { text, type };
    }
    this.requestUpdate();
  }

  async handleNewExp() {
    const experiment = getDefaultData(this._page);
    this._details = processDetails(experiment);
    this.requestUpdate();
  }

  handleDeleteExperiment() {
    this._alertMessage = {
      title: 'Confirm deletion',
      message: 'Are you sure you want to delete this experiment? This will remove the data and re-publish the page.',
      onConfirm: () => {
        this._alertMessage = null;
        deleteExperiment(this._page, this._details, this.setStatus.bind(this)).then(() => {
          this._details = null;
        });
      },
      onCancel: () => { this._alertMessage = null; },
    };
  }

  async saveExperiment(status, forcePublish = false) {
    this._errors = getErrors(this._details);
    if (this._errors) {
      this.setStatus('Please fix errors.', 'error');
      return;
    }

    const onConfirm = async () => {
      this._alertMessage = null;
      // Set the experiment status based on the button clicked
      this._details.status = status;

      // Bind to this so it can be called outside the class
      const setStatus = this.setStatus.bind(this);
      const result = await saveDetails(this._page, this._details, setStatus, forcePublish);
      if (result.status !== 'ok') return;
      this.port.postMessage({ reload: true });
    };

    this._alertMessage = {
      title: 'Confirm action',
      message: `Moving the experiment to ${status} status will also update the page to include any other changes since the last modification. Do you wish to continue?`,
      onConfirm,
    };
  }

  handleLink(e, href) {
    e.preventDefault();
    window.open(href, '_blank');
  }

  handlePreview(e, param) {
    e.preventDefault();

    if (!this._modified) {
      this.port.postMessage({ preview: param });
      return;
    }

    this._alertMessage = {
      title: 'Unsaved Changes',
      message: 'You have unsaved changes in the experimentation plugin. Simulating an experiment will discard these changes. Do you wish to continue?',
      onConfirm: () => {
        this._alertMessage = null;
        this.port.postMessage({ preview: param });
      },
      onCancel: () => {
        this._alertMessage = null;
      },
    };
  }

  handleViewAction(e) {
    if (e.detail.action === 'delete') {
      this.handleDeleteExperiment();
      return;
    }
    if (e.detail.action === 'edit') {
      this._view = 'edit';
      return;
    }
    if (e.detail.action === 'view') {
      this._view = 'view';
      return;
    }
    if (e.detail.action === 'save') {
      this.saveExperiment(e.detail.status);
      return;
    }
    if (e.detail.action === 'pause') {
      this.saveExperiment('draft', true);
      return;
    }
    if (e.detail.action === 'dialog') {
      this._alertMessage = e.detail.dialog;
    }
  }

  get _placeholder() {
    return `${this._page.origin}/experiments/
      ${this._details.name ? `${this._details.name}/` : ''}...`;
  }

  renderHeader() {
    return html`
      <div class="nx-exp-header">
        <h1>Experimentation</h1>
        <nx-profile loginPopup="true" @loaded=${this.handleProfileLoad}></nx-profile>
      </div>
    `;
  }

  renderLogin() {
    return html`
      <div class="nx-new-wrapper">
        <div class="nx-new">
          <img
              alt=""
              src="${nxBase}/img/icons/S2IconLogin20N-icon.svg"
              class="nx-new-icon nx-space-bottom-200" />
          <p class="sl-heading-m nx-space-bottom-100">ABC}</p>
          <p class="sl-body-xs nx-space-bottom-300">123</p>
        </div>
      </div>
    `;
  }

  renderReady() {
    // Do nothing until we have some value.
    if (this._isAllowed === undefined) return nothing;

    // Show the switch profile screen.
    if (this._isAllowed === false) return '<h1>Not allowed.</h1>';

    // If allowed, allow stuff...
    if (this._isAllowed) {
      // If someone set the view to edit, use it.
      if (this._view === 'edit') {
        return html`
          <nx-exp-edit @action=${this.handleViewAction} .details=${this._details} class="nx-content">
          </nx-exp-edit>`;
      }

      // Default to the view screen with details.
      if (this._details) {
        return html`
          <nx-exp-view
            class="nx-content"
            .details=${this._details}
            @action=${this.handleViewAction}>
          </nx-exp-view>
        `;
      }
    }
    return nothing;
  }

  renderDialog() {
    return html`
      <sl-dialog class="nx-dialog" ?open=${this._alertMessage} modal="true">
        <h2>${this._alertMessage?.title}</h2>
        <p>${this._alertMessage?.message}</p>
        <div class="nx-dialog-actions">
          <sl-button
              @click=${() => { this._alertMessage?.onCancel?.(); this._alertMessage = null; }}
              class="primary outline">
            Cancel
          </sl-button>
          <sl-button
              @click=${() => { this._alertMessage?.onConfirm?.(); this._alertMessage = null; }}>
            Confirm
          </sl-button>
        </div>
      </sl-dialog>
    `;
  }

  render() {
    return html`
      ${this.renderHeader()}
      ${this._ims?.anonymous ? html`<nx-exp-login></nx-exp-login>` : this.renderReady()}
      ${this.renderDialog()}
    `;
  }
}

customElements.define('nx-exp', NxExp);

export default async function init() {
  await loadStyle(`${nxBase}/public/sl/styles.css`);
  const expCmp = document.createElement('nx-exp');
  document.body.append(expCmp);

  window.addEventListener('message', (e) => {
    if (e.data?.includes?.('from_ims=true')) window.location.reload();
    if (e.data && e.data.ready) [expCmp.port] = e.ports;
  });

  window.onbeforeunload = () => {
    expCmp.port.postMessage({ reset: true });
  };
}
