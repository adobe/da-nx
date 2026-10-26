import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { LitElement, html } from 'da-lit';
import {
  getUISize, setUISize, UISizeController, UI_SIZE_EVENT,
} from '../../../../utils/ui-size.js';

class UISizeTest extends LitElement {
  _uiSize = new UISizeController(this);

  render() {
    return html`<input><span>${getUISize()}</span>`;
  }
}

customElements.define('nx-ui-size-test', UISizeTest);

describe('live UI size', () => {
  let host;
  let originalSize;
  let originalClasses;

  beforeEach(() => {
    originalSize = localStorage.getItem('ui-size');
    originalClasses = document.body.className;
    localStorage.removeItem('ui-size');
    document.body.classList.remove('ui-size-s', 'ui-size-m', 'ui-size-l');
  });

  afterEach(() => {
    sinon.restore();
    host?.remove();
    if (originalSize === null) localStorage.removeItem('ui-size');
    else localStorage.setItem('ui-size', originalSize);
    document.body.className = originalClasses;
  });

  it('persists the preference, updates only size classes, and emits the applied size', () => {
    document.body.classList.add('dark-scheme');
    const listener = sinon.spy();
    document.addEventListener(UI_SIZE_EVENT, listener, { once: true });
    setUISize({ size: 'm' });
    expect(getUISize()).to.equal('m');
    expect(document.body.classList.contains('ui-size-m')).to.be.true;
    expect(document.body.classList.contains('dark-scheme')).to.be.true;
    expect(listener.firstCall.args[0].detail).to.deep.equal({ size: 'm' });
    setUISize({ size: 's' });
    expect(document.body.classList.contains('ui-size-m')).to.be.false;
    expect(document.body.classList.contains('ui-size-s')).to.be.false;
  });

  it('rejects unavailable sizes without changing the preference', () => {
    expect(() => setUISize({ size: 'l' })).to.throw(RangeError);
    expect(() => setUISize({ size: 'invalid' })).to.throw(RangeError);
    expect(localStorage.getItem('ui-size')).to.equal(null);
  });

  it('does not apply a change when saving the preference fails', () => {
    sinon.stub(Storage.prototype, 'setItem').throws(new DOMException('Storage unavailable', 'QuotaExceededError'));
    expect(() => setUISize({ size: 'm' })).to.throw('Storage unavailable');
    expect(document.body.classList.contains('ui-size-m')).to.be.false;
  });

  it('updates connected hosts without replacing inputs or losing unsaved text', async () => {
    host = document.createElement('nx-ui-size-test');
    document.body.append(host);
    await host.updateComplete;
    const input = host.shadowRoot.querySelector('input');
    input.value = 'Unsaved text';
    setUISize({ size: 'm' });
    await host.updateComplete;
    expect(host.dataset.uiSize).to.equal('m');
    expect(host.shadowRoot.querySelector('span').textContent).to.equal('m');
    expect(host.shadowRoot.querySelector('input')).to.equal(input);
    expect(input.value).to.equal('Unsaved text');
    setUISize({ size: 's' });
    await host.updateComplete;
    expect(host.dataset.uiSize).to.equal('s');
    expect(input.value).to.equal('Unsaved text');
  });

  it('unsubscribes on disconnect and picks up the current size on reconnect', async () => {
    host = document.createElement('nx-ui-size-test');
    document.body.append(host);
    await host.updateComplete;
    host.remove();
    setUISize({ size: 'm' });
    expect(host.dataset.uiSize).to.equal('s');
    document.body.append(host);
    await host.updateComplete;
    expect(host.dataset.uiSize).to.equal('m');
  });

  it('applies changes from another tab and resets after the preference is removed', async () => {
    host = document.createElement('nx-ui-size-test');
    document.body.append(host);
    await host.updateComplete;
    localStorage.setItem('ui-size', 'm');
    window.dispatchEvent(new StorageEvent('storage', { key: 'ui-size', storageArea: localStorage }));
    await host.updateComplete;
    expect(host.dataset.uiSize).to.equal('m');
    expect(document.body.classList.contains('ui-size-m')).to.be.true;
    localStorage.removeItem('ui-size');
    window.dispatchEvent(new StorageEvent('storage', { key: 'ui-size', storageArea: localStorage }));
    await host.updateComplete;
    expect(host.dataset.uiSize).to.equal('s');
    expect(document.body.classList.contains('ui-size-m')).to.be.false;
  });
});
