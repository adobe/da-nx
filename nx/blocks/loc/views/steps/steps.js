import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { getTranslateStepText } from '../../utils/utils.js';

const { nxBase: nx } = getConfig();
const style = await getStyle(import.meta.url);

const STEPS_VIEW = {
  basics: 'setup',
  validate: 'setup',
  options: 'setup',
  sync: 'manage',
  translate: 'manage',
  rollout: 'manage',
};

const ICONS = [
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
    org: { attribute: false },
    site: { attribute: false },
    options: { attribute: false },
    path: { attribute: false },
    langs: { attribute: false },
    urls: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  getShowSync() {
    const prefix = this.options['source.language'].location;
    const needsSync = this.urls.some((url) => !url.suppliedPath.startsWith(prefix));
    return needsSync && prefix !== '/';
  }

  getShowTranslate() {
    return this.langs.some((lang) => lang.action === 'translate' || lang.action === 'copy');
  }

  getShowRollout() {
    return this.langs.some((lang) => lang.locales?.length);
  }

  getSyncCheck() {
    if (!this.urls || !this.urls?.length) return false;

    const filtered = this.urls.filter(
      (url) => url.synced === 'synced' || url.synced === 'skipped',
    );

    return filtered.length === this.urls.length;
  }

  handleSwitchView(newView) {
    const { hash } = window.location;
    const [, org, site] = hash.substring(2).split('/');
    window.location.hash = `/${newView}/${org}/${site}`;
  }

  getTranslateCheck() {
    if (!this.urls || !this.urls?.length) return false;

    if (!this.langs || !this.langs?.length) return false;

    return this.langs.every((lang) => {
      const {
        action = '',
        translation: { saved: translationSaved = 0 } = {},
        copy: { saved: copySaved = 0 } = {},
      } = lang;
      return action === 'rollout' || translationSaved + copySaved === this.urls.length;
    });
  }

  getRolloutCheck() {
    if (!this.urls || !this.urls?.length) return false;

    if (!this.langs || !this.langs?.length) return false;

    return this.langs.every((lang) => {
      const { rollout: { status = '' } = {} } = lang;
      return status === 'complete';
    });
  }

  getStyling(view, defIcon) {
    const views = {
      dashboard: this.org && this.site,
      basics: this.urls,
      validate: this.urls?.some((url) => url.checked),
      options: this.options,
      sync: this.getSyncCheck(),
      translate: this.getTranslateCheck(),
      rollout: this.getRolloutCheck(),
    };

    const filled = views[view] ? ' filled' : '';
    const highlight = view === this.view ? ' highlight' : '';

    // Highlight (active view) should override filled
    const styles = highlight ? { css: highlight } : { css: filled };

    styles.icon = filled && !highlight ? '#S2_Icon_CheckmarkCircleGreen_20_N' : defIcon;

    return styles;
  }

  renderRollout() {
    const rollout = this.getStyling('rollout', '#S2_Icon_FileConvert_20_N');

    return html`
      <button class="nx-loc-wizard-btn${rollout.css}">
        <svg viewBox="0 0 20 20"><use href="${rollout.icon}" /></svg>
        <p>Rollout locales</p>
      </button>`;
  }

  renderTranslate() {
    const translate = this.getStyling('translate', '#S2_Icon_GlobeGrid_20_N');

    return html`
      <button class="nx-loc-wizard-btn${translate.css}">
        <svg viewBox="0 0 20 20"><use href="${translate.icon}" /></svg>
        <p>${getTranslateStepText(this.langs)}</p>
      </button>`;
  }

  renderSync() {
    const sync = this.getStyling('sync', '#S2_Icon_Refresh_20_N');

    return html`
      <button class="nx-loc-wizard-btn${sync.css}">
        <svg viewBox="0 0 20 20"><use href="${sync.icon}" /></svg>
        <p>Sync sources</p>
      </button>`;
  }

  renderManage() {
    if (!this.urls && !this.langs) return nothing;
    const dashboard = this.getStyling('dashboard', '#S2_Icon_Archive_20_N');

    const middle = [];
    if (this.getShowSync()) middle.push(this.renderSync());
    if (this.getShowTranslate()) middle.push(this.renderTranslate());
    if (this.getShowRollout()) middle.push(this.renderRollout());

    const separator = html`<hr/>`;

    const separated = middle.flatMap(
      (item, index) => (index === middle.length - 1 ? [item] : [item, separator]),
    );

    return html`
      <div class="nx-setup-steps-container">
        <button @click=${() => this.handleSwitchView('dashboard')} class="nx-loc-wizard-btn nx-loc-projects${dashboard.css}">
          <svg viewBox="0 0 20 20"><use href="#S2_Icon_Archive_20_N" /></svg>
          <p>All projects</p>
        </button>
        <hr class=""/>
        <div class="nx-setup-steps-middle">
          ${separated.map((content) => content)}
        </div>
        <hr/>
        <button class="nx-loc-wizard-btn">
          <svg viewBox="0 0 20 20"><use href="#S2_Icon_Emoji_20_N" /></svg>
          <p>Project complete</p>
        </button>
      </div>
    `;
  }

  renderSetup() {
    const dashboard = this.getStyling('dashboard', '#S2_Icon_Archive_20_N');
    const basics = this.getStyling('basics', '#S2_Icon_ListBulleted_20_N');
    const validate = this.getStyling('validate', '#S2_Icon_Binoculars_20_N');
    const options = this.getStyling('options', '#S2_Icon_Properties_20_N');

    return html`
      <div class="nx-setup-steps-container">
        <button @click=${() => this.handleSwitchView('dashboard')} class="nx-loc-wizard-btn nx-loc-projects${dashboard.css}">
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
            <p>Validate sources</p>
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

  renderSteps() {
    const stepType = STEPS_VIEW[this.view];

    return stepType === 'setup' ? this.renderSetup() : this.renderManage();
  }

  render() {
    return html`
      ${this.view && this.view !== 'dashboard' && this.view !== 'complete' ? this.renderSteps() : nothing}
    `;
  }
}

customElements.define('nx-loc-steps', NxLocSteps);
