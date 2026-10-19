import { getUISize } from '../scripts/nx.js';

export { getUISize };

export const UI_SIZE_EVENT = 'nx-ui-size-change';

function applyUISize() {
  const size = getUISize();
  document.body.classList.toggle('ui-size-m', size === 'm');
  document.dispatchEvent(new CustomEvent(UI_SIZE_EVENT, { detail: { size } }));
}

const sizedHosts = new Set();

async function sizedHostsUpdated() {
  const done = () => Promise.all([...sizedHosts].map((host) => host.updateComplete));
  await done();
  // Shared children (pickers, menus) re-render after their owners.
  await new Promise((resolve) => { setTimeout(resolve); });
  await done();
}

export function setUISize({ size, animate = false }) {
  if (!['s', 'm'].includes(size)) throw new RangeError(`Unsupported UI size: ${size}`);
  localStorage.setItem('ui-size', size);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduceMotion || !document.startViewTransition) {
    applyUISize();
    return;
  }
  document.startViewTransition(async () => {
    applyUISize();
    await sizedHostsUpdated();
  });
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
    sizedHosts.add(this.host);
    this._update();
    document.addEventListener(UI_SIZE_EVENT, this._update);
  }

  hostDisconnected() {
    sizedHosts.delete(this.host);
    document.removeEventListener(UI_SIZE_EVENT, this._update);
  }
}
