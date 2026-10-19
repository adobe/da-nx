import { getUISize } from '../scripts/nx.js';

export { getUISize };

export const UI_SIZE_EVENT = 'nx-ui-size-change';

function applyUISize() {
  const size = getUISize();
  document.body.classList.toggle('ui-size-m', size === 'm');
  document.dispatchEvent(new CustomEvent(UI_SIZE_EVENT, { detail: { size } }));
}

export function setUISize({ size }) {
  if (!['s', 'm'].includes(size)) throw new RangeError(`Unsupported UI size: ${size}`);
  localStorage.setItem('ui-size', size);
  applyUISize();
}

window.addEventListener('storage', (event) => {
  if (event.storageArea === localStorage && (event.key === 'ui-size' || event.key === null)) {
    applyUISize();
  }
});

export class UISizeController {
  constructor(host, { onChange } = {}) {
    this.host = host;
    this.onChange = onChange;
    host.addController(this);
  }

  _update = () => {
    const size = getUISize();
    this.host.dataset.uiSize = size;
    this.onChange?.(size);
    this.host.requestUpdate();
  };

  hostConnected() {
    this._update();
    document.addEventListener(UI_SIZE_EVENT, this._update);
  }

  hostDisconnected() {
    document.removeEventListener(UI_SIZE_EVENT, this._update);
  }
}
