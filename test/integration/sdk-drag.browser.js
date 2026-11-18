import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse } from '@web/test-runner-commands';

describe('cross-origin SDK pointer dragging', () => {
  let iframe;
  let target;
  let channel;
  let layer;
  let listeners;
  beforeEach(() => { listeners = new AbortController(); });
  afterEach(async () => {
    listeners.abort();
    await resetMouse();
    iframe?.remove();
    target?.remove();
    layer?.remove();
    channel?.port1.close();
    channel?.port2.close();
  });
  [false, true].forEach((image) => {
    it(`hands ${image ? 'an image File' : 'HTML'} to the parent outside a cross-origin iframe`, async () => {
      iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:20px;top:20px;width:200px;height:100px;border:0';
      const url = new URL('/test/fixtures/sdk-drag.html', window.location.href);
      url.hostname = window.location.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
      if (image) url.searchParams.set('image', '1');
      iframe.src = url.href;
      channel = new MessageChannel();
      const ready = new Promise((resolve) => {
        const listener = (event) => {
          if (event.source !== iframe.contentWindow || event.origin !== url.origin) return;
          if (event.data?.type === 'drag-source-loaded') {
            iframe.contentWindow.postMessage({}, url.origin, [channel.port2]);
          } else if (event.data?.type === 'drag-source-ready') {
            window.removeEventListener('message', listener);
            resolve();
          }
        };
        window.addEventListener('message', listener, { signal: listeners.signal });
      });
      target = document.createElement('div');
      target.style.cssText = 'position:fixed;left:20px;top:200px;width:250px;height:100px';
      const shadow = target.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<p>Document target</p>';
      document.body.append(iframe, target);
      await ready;
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      const sourceResult = new Promise((resolve) => {
        window.addEventListener('message', (event) => {
          if (event.source === iframe.contentWindow && event.origin === url.origin
          && event.data?.type === 'drag-source-result') resolve(event.data.result);
        }, { signal: listeners.signal });
      });
      const messages = [];
      let started;
      const hostReady = new Promise((resolve) => { started = resolve; });
      let moved;
      const outsideMove = new Promise((resolve) => { moved = resolve; });
      let dropCount = 0;
      const dropped = new Promise((resolve) => {
        const finish = (point) => {
          if (dropCount) return;
          dropCount += 1;
          if (!image) shadow.innerHTML = messages[0].details.payload.data['text/html'];
          layer.remove();
          resolve(point);
        };
        channel.port1.onmessage = ({ data }) => {
          messages.push(data);
          const result = data.action === 'dragStart' ? { ok: true, dragId: 'host-id' } : { ok: true };
          if (data.action === 'dragStart') {
            layer = document.createElement('div');
            layer.style.cssText = 'position:fixed;inset:0;z-index:10000';
            layer.addEventListener('pointermove', (event) => {
              if (event.buttons === 1 && event.clientY > 120) moved();
            });
            layer.addEventListener('pointerup', (event) => {
              finish({ x: event.clientX - 20, y: event.clientY - 20 });
              channel.port1.postMessage({
                action: 'dragResult', details: { dragId: 'host-id', result: { ok: true } },
              });
            }, { once: true });
            document.body.append(layer);
            started();
          }
          if (data.action === 'dragMove' && data.details.point.y > 100) moved();
          if (data.action === 'dragFinish') {
            finish(data.details.point);
          }
          if (data.requestId) {
            channel.port1.postMessage({ action: 'sdkResponse', requestId: data.requestId, result });
          }
        };
      });
      await sendMouse({ type: 'move', position: [80, 60] });
      await sendMouse({ type: 'down' });
      await sendMouse({ type: 'move', position: [90, 70] });
      await hostReady;
      await sendMouse({ type: 'move', position: [100, 160] });
      await sendMouse({ type: 'move', position: [100, 230] });
      await outsideMove;
      expect(messages.some(({ action }) => action === 'dragFinish')).to.equal(false);
      expect(dropCount).to.equal(0);
      await sendMouse({ type: 'up' });
      const release = await dropped;
      expect(release).to.deep.equal({ x: 80, y: 210 });
      expect(await sourceResult).to.deep.equal({ ok: true });
      if (image) {
        const [file] = messages[0].details.payload.files;
        expect(file).to.be.instanceOf(File);
        expect(file.name).to.equal('photo.png');
        expect(file.type).to.equal('image/png');
        expect(await file.text()).to.equal('original-image');
      } else {
        expect(shadow.querySelector('h2').textContent).to.equal('Heading');
      }
      expect(messages.filter(({ action }) => action === 'dragStart')).to.have.length(1);
      expect(dropCount).to.equal(1);
    });
  });
});
