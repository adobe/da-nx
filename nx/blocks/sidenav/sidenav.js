import { LitElement } from 'lit';

import { loadStyle } from '../../utils/style.js';
import { loadFragment } from '../fragment/fragment.js';

const DEFAULT_NAV_PATH = '/nx/fragments/sidenav';

const style = await loadStyle(import.meta.url);

class NXSidenav extends LitElement {
  static properties = {
    path: { attribute: false },
    _nav: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.loadNav();
  }

  change(props) {
    if (props.has('path') && this.path) {
      this.loadNav();
    }
  }

  async loadNav() {
    const fragment = await loadFragment(this._path);
    this._nav = fragment.querySelector('ul');
  }

  get _path() {
    return this.path || DEFAULT_NAV_PATH;
  }

  render() {
    return this._nav;
  }
}

customElements.define('nx-sidenav', NXSidenav);
