import '../../deps/swc/dist/index.js';
import '../canvas/src/bootstrap-nx.js';
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
// eslint-disable-next-line import/no-unresolved
import { getNx } from 'https://da.live/scripts/utils.js';
import { initIms, daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
// eslint-disable-next-line import/no-unresolved
import '../canvas/src/chat.js';
import './content-browser/index.js';
import {
  createListFetcher,
  createSaveToSource,
  createDeleteItem,
  createRenameItem,
  enrichListItemsWithAemStatus,
  saveToAem as postSaveToAem,
} from './content-browser/api/da-browse-api.js';

const style = await getStyle(import.meta.url);
const nxBase = getNx();

const listFolder = createListFetcher({ daFetch });
const saveToSource = createSaveToSource({ daFetch });

/** Runs after the table renders (async); merges AEM status metadata into rows. */
function aemEnrichListItems(items, fullpath) {
  return enrichListItemsWithAemStatus(items, fullpath, { getIms: initIms });
}
const deleteItem = createDeleteItem({ daFetch });
const renameItem = createRenameItem({ daFetch });
const saveToAem = (path, action) => postSaveToAem(path, action, { getIms: initIms });

/**
 * Browse shell: chat + split layout; file UI is delegated to `sl-content-browser`.
 * @customElement da-browse-view
 */
class BrowseView extends LitElement {
  static properties = {
    _chatOpen: { state: true },
  };

  constructor() {
    super();
    this._chatOpen = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _renderMainPane() {
    return html`
      <div class="browse-view-main">
        <div class="browse-view-toolbar">
          <sp-action-button
            class="browse-view-chat-toggle"
            label="Toggle chat panel"
            ?selected="${this._chatOpen}"
            @click="${() => { this._chatOpen = !this._chatOpen; }}"
          >
            <img src="${nxBase}/img/icons/aichat.svg" slot="icon" alt="" class="browse-view-nav-icon" />
          </sp-action-button>
        </div>
        <sl-content-browser
          class="browse-view-content-browser"
          navigate-with-hash
          canvas-edit-base="https://da.live/canvas"
          sheet-edit-base="https://da.live/sheet"
          .listFolder="${listFolder}"
          .aemEnrichListItems="${aemEnrichListItems}"
          .deleteItem="${deleteItem}"
          .renameItem="${renameItem}"
          .saveToSource="${saveToSource}"
          .saveToAem="${saveToAem}"
        ></sl-content-browser>
      </div>
    `;
  }

  render() {
    return html`
      <div class="browse-view">
        <div class="browse-view-body">
          ${this._chatOpen
        ? html`
                <sp-split-view
                  class="browse-view-split split-view-outer"
                  resizable
                  primary-size="25%"
                  primary-min="280"
                  secondary-min="400"
                  label="Resize chat panel"
                >
                  <da-chat class="browse-view-chat-panel"></da-chat>
                  ${this._renderMainPane()}
                </sp-split-view>
              `
        : this._renderMainPane()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-browse-view', BrowseView);

export default function decorate(block) {
  block.innerHTML = `
    <sp-theme system="spectrum-two" scale="medium" color="light">
      <da-browse-view></da-browse-view>
    </sp-theme>
  `;
}
