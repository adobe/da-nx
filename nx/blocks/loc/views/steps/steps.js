import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';

const { nxBase: nx } = getConfig();
const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Archive_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ListBulleted_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Binoculars_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Properties_20_N.svg`,
  `${nx}/public/icons/S2_Icon_GlobeGrid_20_N.svg`,
  `${nx}/public/icons/S2_Icon_CheckmarkCircleGreen_20_N.svg`,
];

class NxLocSteps extends LitElement {
  static properties = {
    view: { attribute: false },
    org: { attribute: false },
    site: { attribute: false },
    path: { attribute: false },
    urls: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  getStyling(view, defIcon) {
    const views = {
      dashboard: this.org && this.site,
      basics: this.urls,
      validate: this.urls?.some((url) => url.checked),
      options: this.options,
    };

    const filled = views[view] ? ' filled' : '';
    const highlight = view === this.view ? ' highlight' : '';

    const styles = { css: `${filled}${highlight}` };

    styles.icon = filled ? '#S2_Icon_CheckmarkCircleGreen_20_N' : defIcon;

    return styles;
  }

  render() {
    const dashboard = this.getStyling('dashboard', '#S2_Icon_Archive_20_N');
    const basics = this.getStyling('basics', '#S2_Icon_ListBulleted_20_N');
    const validate = this.getStyling('validate', '#S2_Icon_Binoculars_20_N');
    const options = this.getStyling('options', '#S2_Icon_Properties_20_N');

    return html`
      <div class="nx-setup-steps-container">
        <button class="nx-loc-wizard-btn nx-loc-projects${dashboard.css}">
          <svg viewBox="0 0 20 20"><use href="#S2_Icon_Archive_20_N" /></svg>
          <p>All projects</p>
        </button>
        <hr class=""/>
        <div class="nx-setup-steps-middle">
          <button class="nx-loc-wizard-btn nx-loc-basics${basics.css}">
            <svg viewBox="0 0 20 20"><use href="${basics.icon}" /></svg>
            <p>Setup basics</p>
          </button>
          <hr/>
          <button class="nx-loc-wizard-btn nx-loc-basics${validate.css}">
            <svg viewBox="0 0 20 20"><use href="${validate.icon}" /></svg>
            <p>Validate references</p>
          </button>
          <hr/>
          <button class="nx-loc-wizard-btn nx-loc-basics${options.css}">
            <svg viewBox="0 0 20 20"><use href="${options.icon}" /></svg>
            <p>Confirm options</p>
          </button>
        </div>
        <hr/>
        <button class="nx-loc-wizard-btn nx-loc-basics">
          <svg viewBox="0 0 20 20"><use href="#S2_Icon_GlobeGrid_20_N" /></svg>
          <p>Manage project</p>
        </button>
      </div>
    `;
  }
}

customElements.define('nx-loc-steps', NxLocSteps);
