/**
 * Shell web component for embedding third-party apps in an iframe and brokering
 * IMS context to them over a message channel.
 * @module shell
 */

import { LitElement, html, nothing } from 'da-lit';
import { IMS_ORIGIN, loadIms } from '../../utils/ims.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
import { loadStyle, loadPageStyle } from '../../utils/utils.js';
import { getColorScheme } from '../../scripts/nx.js';

const style = await loadStyle(import.meta.url);
const HOST_STYLE_HREF = new URL('shell-host.css', import.meta.url).href;

const TRUSTED_ORGS = ['adobe'];
const TRUSTED_APPS = [
  'https://main--storefront-tools--adobe-commerce.aem.live/tools/site-creator/site-creator.html',
  'https://main--storefront-tools--adobe-commerce.aem.live/tools/config-generator/config-generator.html',
];

class NxShell extends LitElement {
  static properties = {
    _showFrame: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    loadPageStyle(HOST_STYLE_HREF);
    this.init();
  }

  /**
   * Parses the current URL into the context shared with the embedded app.
   * @returns {Object} view, org, repo, ref, path, search, hash, daOrigin, imsOrigin
   */
  get parts() {
    const { pathname, search, hash } = window.location;
    const pathSplit = pathname.split('/');
    pathSplit.splice(0, 2);
    const [org, repo, ...path] = pathSplit;
    const ref = new URLSearchParams(search).get('ref') || 'main';
    return {
      view: 'fullscreen',
      org,
      repo,
      ref,
      path: path.join('/'),
      search,
      hash,
      daOrigin: DA_ORIGIN,
      imsOrigin: IMS_ORIGIN,
    };
  }

  /**
   * Constructs the iframe URL, forwarding parent search params and hash.
   * @returns {string} The constructed URL for the iframe
   */
  get url() {
    const {
      org, repo, ref, path, search, hash,
    } = this.parts;
    const base = ref === 'local'
      ? `http://localhost:3000/${path}.html`
      : `https://${ref}--${repo}--${org}.aem.live/${path}.html`;
    // Forward the active scheme so the embedded app can match the parent's
    // dark/light mode (localStorage is not shared across the iframe origin).
    const url = new URL(`${base}${search}${hash}`);
    url.searchParams.set('colorScheme', getColorScheme());
    return url.toString();
  }

  init() {
    const { org, repo, ref } = this.parts;
    if (this.isAppTrusted(org, repo, ref)) {
      this.frame();
    } else {
      this.showDisclaimer();
    }
  }

  frame() {
    if (!document.querySelector('header')) document.body.classList.add('no-shell');
    this._showFrame = true;
  }

  isAppTrusted(org, repo, ref) {
    if (TRUSTED_ORGS.includes(org)) return true;
    if (TRUSTED_APPS.some((trustedApp) => this.url.startsWith(trustedApp))) return true;

    const trustedApps = JSON.parse(localStorage.getItem('trustedApps') || '{}');
    return trustedApps[`${org}/${repo}/${ref}`] === true;
  }

  trustApp(org, repo, ref) {
    const trustedApps = JSON.parse(localStorage.getItem('trustedApps') || '{}');
    trustedApps[`${org}/${repo}/${ref}`] = true;
    localStorage.setItem('trustedApps', JSON.stringify(trustedApps));
  }

  /**
   * Sets up the message channel and posts IMS context once the iframe loads.
   * @param {Event} e - The iframe load event
   */
  async handleLoad(e) {
    const { target } = e;
    const channel = new MessageChannel();
    const { port1, port2 } = channel;

    port1.onmessage = (ev) => {
      if (ev.data.action === 'setTitle') document.title = ev.data.details;
    };

    const { accessToken, email } = await loadIms();

    const message = {
      ready: true,
      token: accessToken?.token,
      email,
      context: this.parts,
    };

    setTimeout(() => {
      target.contentWindow.postMessage(message, '*', [port2]);
    }, 750);
  }

  async showDisclaimer() {
    // sl-dialog / sl-button are only needed for the disclaimer, so load lazily.
    await import('../../public/sl/components.js');

    const { org, repo, ref, path } = this.parts;
    const appName = path.split('/').pop();
    const devWarning = ref !== 'main'
      ? `<p><b>Note:</b> You are accessing a development version of the app on branch <b>${ref}</b>.`
      : '';
    const disclaimer = document.createElement('div');
    disclaimer.classList.add('disclaimer');
    disclaimer.innerHTML = `
      <sl-dialog>
        <div class="nx-dialog">
          <h2>Warning</h2>
          <div>
          </div>
          <p>You are about to access an app named <b>${appName}</b> hosted by <b>${org}/${repo}</b>.<br>
          Make sure you trust the host <b>${org}/${repo}</b>. Their app may take any action on your behalf, including <b>deleting content</b> you have access to.</p>
          ${devWarning}
          <p><b>Are you sure you want to continue?</b></p>
          <div class="nx-button-group">
            <sl-button class="negative outline" name="continue">Continue</sl-button>
            <sl-button name="cancel">Cancel</sl-button>
          </div>
        </div>
      </sl-dialog>
    `;
    document.body.appendChild(disclaimer);
    disclaimer.querySelector('sl-button[name="continue"]').addEventListener('click', () => {
      this.trustApp(org, repo, ref);
      this.frame();
      disclaimer.remove();
    });
    disclaimer.querySelector('sl-button[name="cancel"]').addEventListener('click', () => {
      disclaimer.remove();
      window.location = '/';
    });
    disclaimer.querySelector('sl-dialog').showModal();
    setTimeout(() => {
      disclaimer.querySelector('sl-button[name="cancel"]').focus();
    }, 400);
  }

  render() {
    if (!this._showFrame) return nothing;
    return html`<iframe allow="clipboard-write *" src=${this.url} @load=${this.handleLoad}></iframe>`;
  }
}

if (!customElements.get('nx-shell')) customElements.define('nx-shell', NxShell);

export default function init(el) {
  el.replaceWith(document.createElement('nx-shell'));
}
