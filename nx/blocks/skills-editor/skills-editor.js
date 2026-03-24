import { html, LitElement, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';
import { loadSkills, saveSkill, deleteSkill, loadCodeMirror, updateCodeMirror } from './utils/utils.js';

import '../../public/sl/components.js';
import '../shared/path/path.js';

const { nxBase: nx } = getConfig();

const ICONS = [
  `${nx}/public/icons/S2_Icon_InfoCircle_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertDiamond_20_N.svg`,
  `${nx}/public/icons/S2_Icon_CheckmarkCircle_20_N.svg`,
];

const EL_NAME = 'nx-skills-editor';
const DEFAULT_SKILL = '# New Skill\n\nDescribe this skill here.\n';

const styles = await getStyle(import.meta.url);
const icons = await getSvg({ paths: ICONS });

class SkillsEditor extends LitElement {
  static properties = {
    _org: { state: true },
    _site: { state: true },
    _alert: { state: true },
    _skills: { state: true },
    _currentSkill: { state: true },
    _createNew: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.shadowRoot.append(...icons);
  }

  updated(props) {
    if (!(props.has('_currentSkill') || props.has('_createNew'))) return;

    const doc = this._skills?.[this._currentSkill] ?? DEFAULT_SKILL;

    if (!this._editor) {
      this._editor = loadCodeMirror(this.codeEditor, doc);
      return;
    }

    updateCodeMirror(this._editor, doc);
  }

  async handleDetail({ detail }) {
    this._org = detail.org;
    this._site = detail.site;

    if (!this._org) {
      this._alert = { type: 'warning', message: 'Please enter an org/site to view skills.' };
      return;
    }

    const skills = await loadSkills(this._org, this._site);

    if (!Object.keys(skills).length) {
      this._skills = {};
      this._createNew = true;
      this._alert = { type: 'warning', message: 'No skills found. Please create one.' };
      return;
    }

    this._skills = skills;
    this.setDefault();
  }

  setDefault() {
    this._createNew = undefined;
    this._alert = { type: 'info', message: 'Select a skill to edit.' };
    ([this._currentSkill] = Object.keys(this._skills));
  }

  getPrefix() {
    const prefix = `/${this._org}`;
    return this._site ? `${prefix}/${this._site}` : prefix;
  }

  handleSkillChange({ target }) {
    if (target.value === 'nx-new-skill') {
      this._createNew = true;
      this._currentSkill = undefined;
      return;
    }
    this._currentSkill = target.value;
  }

  async handleDelete() {
    const id = this._currentSkill;
    const prefix = this.getPrefix();
    const result = await deleteSkill(prefix, id);
    if (result.error) {
      this.newInput.error = result.error;
      return;
    }
    delete this._skills[id];
    this.setDefault();
  }

  async handleSave(isUpdate) {
    const id = isUpdate && this._currentSkill ? this._currentSkill : this.newInput.value;
    const content = this._editor.state.doc.toString();
    const prefix = this.getPrefix();
    const result = await saveSkill(prefix, id, content);
    if (result.error) {
      this.newInput.error = result.error;
      return;
    }
    if (!isUpdate) {
      this._skills[id] = content;
      this._createNew = undefined;
    }
    this._alert = { type: 'success', message: 'Skill saved.' };
  }

  handleNewInput({ target }) {
    target.value = target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  get newInput() {
    return this.shadowRoot.querySelector('[name="new-skill"]');
  }

  get codeEditor() {
    return this.shadowRoot.querySelector('.nx-codemirror');
  }

  // Programatically make the select so lit doesn't keep old options
  get skillSelect() {
    const skills = { ...this._skills, 'nx-new-skill': 'New skill' };
    const select = document.createElement('sl-select');
    const options = Object.keys(skills).map((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.innerText = key === 'nx-new-skill' ? 'New skill' : key;
      return option;
    });
    if (this._currentSkill) select.value = this._currentSkill;
    select.append(...options);
    select.addEventListener('change', (e) => { this.handleSkillChange(e); });
    return select;
  }

  renderSelectSkill() {
    return html`
      ${this.skillSelect}
      <sl-button class="negative outline" @click=${this.handleDelete}>Delete skill</sl-button>
      <sl-button @click=${() => this.handleSave(true)}>Save skill</sl-button>`;
  }

  renderNewSkill() {
    return html`
      <sl-input type="text" name="new-skill" placeholder="new-skill-name" @input=${this.handleNewInput}></sl-input>
      <sl-button class="primary outline" @click=${this.setDefault}>Cancel</sl-button>
      <sl-button @click=${this.handleSave}>Save skill</sl-button>
    `;
  }

  renderEditor() {
    return html`
      <div class="skill-select-wrapper">
        ${!this._skills || this._createNew ? this.renderNewSkill() : this.renderSelectSkill()}
      </div>
      <div class="nx-codemirror"></div>
    `;
  }

  renderAlert() {
    if (!this._alert) return nothing;

    const type2icon = {
      info: 'InfoCircle',
      warning: 'AlertDiamond',
      success: 'CheckmarkCircle',
    };

    return html`
      <div class="nx-alert ${this._alert.type || 'info'}">
        <svg class="icon"><use href="#S2_Icon_${type2icon[this._alert.type || 'info']}_20_N"/></svg>
        <p>${this._alert.message}</p>
      </div>
    `;
  }

  render() {
    return html`
      <nx-path label="Load skills" @details=${this.handleDetail}></nx-path>
      <h1>Skills Editor</h1>
      ${this.renderAlert()}
      ${this._skills ? this.renderEditor() : nothing}
    `;
  }
}

customElements.define(EL_NAME, SkillsEditor);

export default function init(el) {
  el.replaceChildren();
  let cmp = el.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }
}
