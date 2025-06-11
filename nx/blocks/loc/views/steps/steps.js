import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { VIEWS, calculateView } from './index.js';

const { nxBase: nx } = getConfig();
const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/img/icons/Smock_ChevronLeft_18_N.svg`,
  `${nx}/img/icons/Smock_ChevronRight_18_N.svg`,
  `${nx}/public/icons/S2_Icon_Archive_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Emoji_20_N.svg`,
  `${nx}/public/icons/S2_Icon_FileConvert_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Refresh_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ListBulleted_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Binoculars_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Properties_20_N.svg`,
  `${nx}/public/icons/S2_Icon_GlobeGrid_20_N.svg`,
  `${nx}/public/icons/S2_Icon_CheckmarkCircleGreen_20_N.svg`,
];

class NxLocSteps extends LitElement {
  static properties = {
    view: { attribute: false },
    step: { attribute: false },
    org: { attribute: false },
    site: { attribute: false },
    project: { attribute: false },
    message: { attribute: false },
    _prev: { state: true },
    _next: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  update(props) {
    if (props.has('view')) {
      this.getSteps();
      this.getActions();
    }
    super.update();
  }

  getSteps() {
    const { org, site, project } = this;
    this._steps = Object.values(VIEWS).reduce((acc, view) => {
      const { step } = view({ view: this.view, org, site, project });
      if (step.visible) acc.push(step);
      return acc;
    }, []);
  }

  getActions() {
    const { view, org, site, project } = this;
    this._prev = VIEWS[this.view]({ view, org, site, project }).prev;
    this._next = VIEWS[this.view]({ view, org, site, project }).next;
  }

  async handleAction(dir) {
    const existing = this.project || { org: this.org, site: this.site };

    const { message, data: updates } = await this.step.getUpdates();

    // If there are updates, combine them with the current project
    const data = updates ? { ...existing, ...updates } : existing;

    // Calculate the next view based on updates from the step
    const { href, hash, view } = calculateView(this.view, dir, data);
    data.view = view;

    const opts = { detail: { message, href, hash, data }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  get step() {
    return this.parentNode.querySelector('.nx-loc-step');
  }

  renderStepButton(step) {
    return html`
      <button class="nx-loc-wizard-btn ${step.style}">
        <svg viewBox="0 0 20 20"><use href="${step.icon}" /></svg>
        <p>${step.text}</p>
      </button>
    `;
  }

  renderSteps() {
    if (this._steps.length === 0) return nothing;
    const displaySteps = [...this._steps];
    const first = displaySteps.shift();
    const last = displaySteps.pop();

    const separated = displaySteps.flatMap(
      (step, index) => (index === displaySteps.length - 1
        ? [this.renderStepButton(step)]
        : [this.renderStepButton(step), html`<hr/>`]),
    );

    return html`
      <div class="nx-steps-wrapper">
        <div class="nx-steps-container">
          ${this.renderStepButton(first)}
          <hr/>
          <div class="nx-steps-middle">
            ${separated.map((content) => content)}
          </div>
          <hr/>
          ${this.renderStepButton(last)}
        </div>
      </div>
    `;
  }

  renderActions() {
    return html`
      <div class="nx-loc-actions-header">
        <button class="nx-prev" @click=${() => this.handleAction('prev')}>
          <svg class="icon"><use href="#spectrum-chevronLeft"/></svg>
          <span>${this._prev.text}</span>
        </button>
        ${this.message ? html`<p class="message type-${this.message.type || 'info'}">${this.message.text}</p>` : nothing}
        <button class="nx-next ${this._next.style}" @click=${() => this.handleAction('next')} ?disabled=${this._next.disabled}>
          <span>${this._next.text}</span>
          <svg class="icon"><use href="#spectrum-chevronRight"/></svg>
        </button>
      </div>`;
  }

  render() {
    return html`
      ${this.renderSteps()}
      ${this.renderActions()}
    `;
  }
}

customElements.define('nx-loc-steps', NxLocSteps);
