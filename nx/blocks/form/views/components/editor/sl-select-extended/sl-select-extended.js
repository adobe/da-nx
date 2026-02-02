import { getConfig } from '../../../../../../scripts/nexter.js';
import getStyle from '../../../../../../utils/styles.js';

const { nxBase: nx } = getConfig();

// Ensure base sl-* components are registered before subclassing
await import(`${nx}/public/sl/components.js`);
const globalStyle = await getStyle(new URL('../../../../../global.css', import.meta.url).href);
const sharedStyle = await getStyle(new URL('../sl-shared.css', import.meta.url).href);

// Reuse the already-registered base class from the sl-components bundle
const SlSelectBase = customElements.get('sl-select');

/**
 * Extended select component with custom styling.
 * Extends Shoelace select with form-specific styles.
 */
class SlSelectExtended extends SlSelectBase {
  connectedCallback() {
    const existingInternals = this._internals;
    if (existingInternals) {
      this.attachInternals = () => existingInternals;
    }
    super.connectedCallback();
    const currentSheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...currentSheets, globalStyle, sharedStyle];
  }
}

customElements.define('sl-select-extended', SlSelectExtended);
export default SlSelectExtended;


