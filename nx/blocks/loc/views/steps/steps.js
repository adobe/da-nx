import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../../nx2/utils/utils.js';
import { VIEWS } from '../../utils/steps.js';

const style = await loadStyle(import.meta.url);

class NxLocSteps extends LitElement {
  static properties = {
    project: { attribute: false },
    _steps: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
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
