import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import { saveToAem } from '../../browse-api.js';
import '../../../shared/overlay/overlay.js';
import '../../../shared/progress-circle/progress-circle.js';

function openAemUrlWithNoCache(href) {
  const h = href.trim();
  if (!h) return;
  window.open(`${h}?nocache=${Date.now()}`, '_blank', 'noopener,noreferrer');
}

export async function deploy({ sourcePath, action }) {
  const seq = action === 'publish' ? ['preview', 'live'] : ['preview'];
  for (const phase of seq) {
    const r = await saveToAem(sourcePath, phase);
    if ('error' in r) {
      const label = phase === 'live' ? 'Publish' : 'Preview';
      const status = r.status ?? 0;
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
        message: {
          title: `${label} failed`,
          body,
          isError: true,
        },
      };
    }
    if (phase === 'preview') {
      const url = r.json?.preview?.url;
      if (url && action === 'preview') {
        openAemUrlWithNoCache(url);
      }
    } else {
      const url = r.json?.live?.url;
      if (url) openAemUrlWithNoCache(url);
    }
  }
  return { ok: true };
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
      if (result.ok) this._emitComplete({ success: true });
      else if (result.message) this._emitComplete({ message: result.message });
      else this._emitComplete();
    } catch {
      this._emitComplete({
        message: {
          title: 'Something went wrong',
          body: 'An unexpected error occurred.',
          isError: true,
        },
      });
    }
  }

  render() {
    const progressLabel = this.action === 'publish' ? 'Publishing' : 'Previewing';
    return html`
      <nx-overlay>
        <nx-progress-circle .label=${progressLabel}></nx-progress-circle>
      </nx-overlay>
    `;
  }
}

customElements.define('nx-browse-deploy-runner', NxBrowseDeployRunner);
