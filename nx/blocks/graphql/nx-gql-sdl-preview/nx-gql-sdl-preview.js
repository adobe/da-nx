import { html, LitElement } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import { getColorScheme } from '../../../../nx2/scripts/nx.js';

const style = await loadStyle(import.meta.url);

const EL_NAME = 'nx-gql-sdl-preview';

class SdlPreview extends LitElement {
  static properties = {
    sdl: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unwatchScheme?.();
    this._editor?.destroy();
    this._editor = undefined;
  }

  async firstUpdated() {
    const cm = await import('../../../deps/codemirror/dist/index.js');
    const theme = new cm.Compartment();
    const getTheme = () => (getColorScheme() === 'dark-scheme' ? cm.oneDark : cm.githubLight);
    this._editor = new cm.EditorView({
      doc: this.sdl ?? '',
      extensions: [
        cm.basicSetup,
        cm.EditorView.editable.of(false),
        theme.of(getTheme()),
      ],
      parent: this.shadowRoot.querySelector('.sdl-editor'),
    });
    // The profile menu toggles the body class; the OS setting applies when none is stored.
    const onScheme = () => this._editor?.dispatch({ effects: theme.reconfigure(getTheme()) });
    const media = matchMedia('(prefers-color-scheme: dark)');
    const observer = new MutationObserver(onScheme);
    media.addEventListener('change', onScheme);
    observer.observe(document.body, { attributeFilter: ['class'] });
    this._unwatchScheme = () => {
      media.removeEventListener('change', onScheme);
      observer.disconnect();
    };
  }

  updated(props) {
    if (!props.has('sdl') || !this._editor) return;
    const doc = this.sdl ?? '';
    if (this._editor.state.doc.toString() === doc) return;
    this._editor.dispatch({ changes: { from: 0, to: this._editor.state.doc.length, insert: doc } });
  }

  render() {
    return html`
      <slot></slot>
      <div class="sdl-editor" ?hidden=${!this.sdl}></div>
    `;
  }
}

customElements.define(EL_NAME, SdlPreview);
