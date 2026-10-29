import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { makeDraggable } from '../../nx/utils/sdk/drag.js';
import { createHostActions } from '../../nx/utils/sdk.js';

describe('SDK draggable sources', () => {
  let element;
  let dispose;
  let request;
  let port;
  let onResult;
  const pointer = (type, x = 10, y = 10) => element.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
  }));
  const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });
  beforeEach(() => {
    element = document.createElement('button');
    document.body.append(element);
    sinon.stub(element, 'setPointerCapture');
    sinon.stub(element, 'hasPointerCapture').returns(true);
    sinon.stub(element, 'releasePointerCapture');
    request = sinon.stub().resolves({ ok: true, dragId: 'host-drag' });
    port = new EventTarget();
    port.postMessage = sinon.spy();
    port.start = sinon.spy();
    onResult = sinon.spy();
  });
  afterEach(() => {
    dispose?.();
    dispose = undefined;
    element.remove();
    sinon.restore();
  });
  const bind = (getData = () => ({ data: { 'text/html': '<h2>Heading</h2>' } })) => {
    dispose = makeDraggable({
      element, getData, request, port, onResult, supported: true,
    });
  };
  it('starts after the threshold, finishes at release coordinates, and suppresses only drag clicks', async () => {
    bind();
    pointer('pointerdown');
    pointer('pointermove', 12);
    expect(request.called).to.equal(false);
    pointer('pointermove', 25);
    pointer('pointerup', -40, 50);
    await settle();
    expect(request.firstCall.args).to.deep.equal(['dragStart', {
      payload: { data: { 'text/html': '<h2>Heading</h2>' } }, point: { x: 25, y: 10 },
    }]);
    expect(request.secondCall.args).to.deep.equal(['dragFinish', {
      dragId: 'host-drag', point: { x: -40, y: 50 },
    }]);
    expect(onResult.calledOnce).to.equal(true);
    const click = sinon.spy();
    element.addEventListener('click', click);
    element.click();
    expect(click.called).to.equal(false);
    pointer('pointerdown');
    pointer('pointerup');
    element.click();
    expect(click.calledOnce).to.equal(true);
  });
  it('cancels a pending start after disposal without finishing or swallowing later native behavior', async () => {
    let accept;
    request.returns(new Promise((resolve) => { accept = resolve; }));
    bind();
    pointer('pointerdown');
    pointer('pointermove', 30);
    dispose();
    dispose = undefined;
    accept({ ok: true, dragId: 'late-start' });
    await settle();
    expect(port.postMessage.firstCall.args[0]).to.deep.equal({
      action: 'dragCancel', details: { dragId: 'late-start' },
    });
    expect(element.hasAttribute('draggable')).to.equal(false);
    expect(element.style.touchAction).to.equal('');
    expect(request.calledOnce).to.equal(true);
  });
  it('preserves image Files without base64 encoding and cancels on Escape', async () => {
    const file = new File(['image'], 'image.png', { type: 'image/png' });
    bind(() => ({ files: [file] }));
    pointer('pointerdown');
    pointer('pointermove', 30);
    await settle();
    expect(request.firstCall.args[1].payload.files[0]).to.equal(file);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(port.postMessage.calledWith({
      action: 'dragCancel', details: { dragId: 'host-drag' },
    })).to.equal(true);
    pointer('pointerup');
    expect(request.calledOnce).to.equal(true);
  });
  it('uses native dataTransfer on hosts without the negotiated capability', async () => {
    const actions = createHostActions({ port });
    dispose = await actions.makeDraggable({
      element, getData: () => ({ data: { 'text/html': '<p>Native</p>' } }),
    });
    const dataTransfer = new DataTransfer();
    element.dispatchEvent(new DragEvent('dragstart', { dataTransfer }));
    expect(dataTransfer.getData('text/html')).to.equal('<p>Native</p>');
    expect(element.draggable).to.equal(true);
    expect(port.postMessage.called).to.equal(false);
  });
  it('hands mouse capture to the host and reports its terminal result once', async () => {
    bind();
    pointer('pointerdown');
    pointer('pointermove', 30);
    await settle();
    expect(element.releasePointerCapture.calledOnce).to.equal(true);
    pointer('lostpointercapture');
    expect(port.postMessage.calledWithMatch({ action: 'dragCancel' })).to.equal(false);
    const result = {
      action: 'dragResult', details: { dragId: 'host-drag', result: { ok: true } },
    };
    port.dispatchEvent(new MessageEvent('message', { data: result }));
    port.dispatchEvent(new MessageEvent('message', { data: result }));
    await settle();
    expect(onResult.calledOnceWithExactly({ ok: true })).to.equal(true);
    expect(request.calledOnce).to.equal(true);
  });
  it('deduplicates a host result and a pending finish acknowledgement', async () => {
    let acknowledge;
    request.onSecondCall().returns(new Promise((resolve) => { acknowledge = resolve; }));
    bind();
    pointer('pointerdown');
    pointer('pointermove', 30);
    pointer('pointerup');
    await settle();
    port.dispatchEvent(new MessageEvent('message', {
      data: { action: 'dragResult', details: { dragId: 'host-drag', result: { ok: true } } },
    }));
    acknowledge({ ok: true });
    await settle();
    expect(onResult.calledOnceWithExactly({ ok: true })).to.equal(true);
  });
  it('reports rejected starts without sending a finish or leaving capture active', async () => {
    request.resolves({ ok: false, error: 'unavailable' });
    bind();
    pointer('pointerdown');
    pointer('pointermove', 30);
    await settle();
    pointer('pointerup');
    expect(onResult.calledOnceWithExactly({ ok: false, error: 'unavailable' })).to.equal(true);
    expect(element.releasePointerCapture.calledOnce).to.equal(true);
    expect(request.calledOnce).to.equal(true);
  });
});
