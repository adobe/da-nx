import { getConfig } from '../../../../../../scripts/nexter.js';
import getStyle from '../../../../../../utils/styles.js';

const { nxBase: nx } = getConfig();

// Ensure base sl-* components are registered before subclassing
await import(`${nx}/public/sl/components.js`);
const globalStyle = await getStyle(new URL('../../../../../global.css', import.meta.url).href);
const sharedStyle = await getStyle(new URL('../sl-shared.css', import.meta.url).href);

// Reuse the already-registered base class from the sl-components bundle
const SlInputBase = customElements.get('sl-input');

/**
 * Extended input component with custom styling.
 * Note: Debouncing is handled at the consumer level (generic-field).
 */
class SlInputExtended extends SlInputBase {
  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, sharedStyle];
  }
}

customElements.define('sl-input-extended', SlInputExtended);
export default SlInputExtended;
