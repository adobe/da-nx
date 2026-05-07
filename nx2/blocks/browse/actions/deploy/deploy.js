import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import { saveToAem } from '../../browse-api.js';
import '../../overlay/overlay.js';
import '../../../shared/progress-circle/progress-circle.js';

export async function deploy({ sourcePath, action }) {
  const openedUrls = [];
  const phases = action === 'publish' ? ['preview', 'live'] : ['preview'];
  for (const phase of phases) {
    const saveResult = await saveToAem(sourcePath, phase);
    if ('error' in saveResult) {
      const status = saveResult.status ?? 0;
      let body = 'The operation could not be completed. Please try again.';
      if (status === 404) {
        body = 'Resource not found or already removed.';
      } else if (status === 403) {
        body = 'You do not have permission to complete this action.';
      }
      if (
        action === 'publish'
        && phase === 'preview'
        && status !== 404
      ) {
        body += '\n\nThe resource was not published to live because preview did not succeed.';
      }
      return {
        ok: false,
        message: body,
      };
    }
    if (phase === 'preview') {
      const url = saveResult.json?.preview?.url;
      if (url && action === 'preview') {
        openedUrls.push(url);
      }
    } else {
      const url = saveResult.json?.live?.url;
      if (url) openedUrls.push(url);
    }
  }
  return { ok: true, openedUrls };
}

const styles = await loadStyle(import.meta.url);

class NxBrowseDeployRunner extends LitElement {
  static properties = {
    selectedRow: { type: Object },
    action: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _emitComplete(detail = {}) {
    this.dispatchEvent(new CustomEvent('nx-browse-action-complete', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  firstUpdated() {
    super.firstUpdated();
    this._run();
  }

  async _run() {
    const { selectedRow, action } = this;
    const sourcePath = selectedRow?.path;
    if (
      !sourcePath
      || (action !== 'preview' && action !== 'publish')
    ) {
      this._emitComplete();
      return;
    }
    try {
      const result = await deploy({ sourcePath, action });
      if (result.ok) {
        this._emitComplete({
          success: true,
          openedUrls: result.openedUrls,
        });
      } else if (result.message) this._emitComplete({ message: result.message });
      else this._emitComplete();
    } catch {
      this._emitComplete({
        message: 'An unexpected error occurred.',
      });
    }
  }

  render() {
    const progressLabel = this.action === 'publish' ? 'Publishing' : 'Previewing';
    return html`
      <nx-browse-overlay>
        <nx-progress-circle .label=${progressLabel}></nx-progress-circle>
      </nx-browse-overlay>
    `;
  }
}

customElements.define('nx-browse-deploy-runner', NxBrowseDeployRunner);
