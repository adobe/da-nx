import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import { saveToAem } from '../../browse-api.js';
import '../../../shared/dialog/dialog.js';
import '../../../shared/progress-circle/progress-circle.js';

function openAemUrlWithNoCache(href) {
  const h = href.trim();
  if (!h) return;
  window.open(`${h}?nocache=${Date.now()}`, '_blank', 'noopener,noreferrer');
}

async function deploy({ sourcePath, action }) {
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
      if (url) openAemUrlWithNoCache(url);
    } else {
      const url = r.json?.live?.url;
      if (url) openAemUrlWithNoCache(url);
    }
  }
  return { ok: true };
}

const styles = await loadStyle(import.meta.url);

class NxBrowseDeployDialog extends LitElement {
  static properties = {
    selectedRow: { type: Object },
    action: { type: String },
    onComplete: { type: Function, attribute: false },
    _pending: { state: true, type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _onCancel = () => {
    this.onComplete?.();
  };

  _onConfirm = async () => {
    const { selectedRow, action, onComplete } = this;
    const sourcePath = selectedRow?.path;
    if (
      !sourcePath
      || (action !== 'preview' && action !== 'publish')
    ) {
      onComplete?.();
      return;
    }
    this._pending = true;
    try {
      const result = await deploy({ sourcePath, action });
      if (result.ok) onComplete?.({ success: true });
      else onComplete?.({ message: result.message });
    } catch {
      onComplete?.({
        message: {
          title: 'Something went wrong',
          body: 'An unexpected error occurred.',
          isError: true,
        },
      });
    } finally {
      this._pending = false;
    }
  };

  _onClose = () => {
    this.onComplete?.();
  };

  render() {
    const { action, selectedRow } = this;
    if (
      !selectedRow?.path
      || (action !== 'preview' && action !== 'publish')
    ) {
      return nothing;
    }

    const isPublish = action === 'publish';
    const title = isPublish ? 'Publish' : 'Preview';
    const progressLabel = isPublish ? 'Publishing' : 'Previewing';
    const lead = isPublish
      ? 'The following resource will be published.'
      : 'The following resource will be previewed.';

    const body = html`
      <div>
        <p class="lead">${lead}</p>
        <p class="path">${selectedRow.path}</p>
      </div>
    `;

    return html`
      <div class="browse-action-root">
        <nx-dialog
          .title=${title}
          .body=${body}
          .cancelLabel=${'Cancel'}
          .onCancel=${this._onCancel}
          .primaryActionLabel=${isPublish ? 'Publish' : 'Preview'}
          .primaryActionId=${'browse-deploy-confirm'}
          .onPrimaryAction=${this._onConfirm}
          .autofocusId=${'browse-deploy-confirm'}
          .dismissable=${!this._pending}
          .primaryActionDisabled=${this._pending}
          @nx-dialog-close=${this._onClose}
        ></nx-dialog>
        ${this._pending
        ? html`
              <div class="browse-action-busy" aria-live="polite">
                <nx-progress-circle .label=${progressLabel}></nx-progress-circle>
              </div>
            `
        : nothing}
      </div>
    `;
  }
}

customElements.define('nx-browse-deploy-dialog', NxBrowseDeployDialog);
