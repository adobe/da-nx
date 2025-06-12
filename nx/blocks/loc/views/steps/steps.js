import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { VIEWS } from '../../utils/steps.js';

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
    project: { attribute: false },
    _steps: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  update(props) {
    if (props.has('project')) this.getSteps();
    super.update();
  }

  getSteps() {
    this._steps = Object.values(VIEWS).reduce((acc, view) => {
      const { step } = view(this.project);
      if (step.visible) acc.push(step);
      return acc;
    }, []);
  }

  renderStepButton(step) {
    return html`
      <button class="nx-loc-wizard-btn ${step.style}">
        <svg viewBox="0 0 20 20"><use href="${step.icon}" /></svg>
        <p>${step.text}</p>
      </button>
    `;
  }

  render() {
    if (!this._steps?.length) return nothing;
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
}

customElements.define('nx-loc-steps', NxLocSteps);
