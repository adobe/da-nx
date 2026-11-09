import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

const MODULE = '../../../../../nx/public/plugins/quick-edit/quick-edit.js';
let instance = 0;

describe('quick-edit SET_READ_ONLY', () => {
  let url;
  let channel;

  const response = (type) => new Promise((resolve) => {
    channel.port1.onmessage = ({ data }) => { if (data.type === type) resolve(data); };
  });
  const resolveDrop = async (requestId) => {
    const resolved = response('drop-target');
    channel.port1.postMessage({
      type: 'drop-target',
      payload: { phase: 'resolve', kind: 'html', x: 15, y: 29, requestId },
    });
    return (await resolved).payload.target;
  };
  const setReadOnly = async (readOnly) => {
    channel.port1.postMessage({ type: 'set-read-only', payload: { readOnly } });
    await new Promise((r) => { setTimeout(r, 0); });
  };
  const start = async (canWrite) => {
    window.history.replaceState(null, '', '?controller=parent');
    document.body.innerHTML = '<main><p data-prose-index="1">Existing</p></main>';
    instance += 1;
    const { default: loadQuickEdit } = await import(`${MODULE}?instance=${instance}`);
    await loadQuickEdit({}, async () => {});
    const ready = response('ready');
    window.dispatchEvent(new MessageEvent('message', {
      source: window.parent,
      ports: [channel.port2],
      data: { type: 'init', payload: { config: { canWrite } } },
    }));
    await ready;
    sinon.stub(document, 'elementFromPoint').callsFake(() => document.querySelector('main p'));
    sinon.stub(HTMLElement.prototype, 'getBoundingClientRect').returns({
      top: 10, bottom: 30, left: 10, width: 100, height: 20,
    });
    channel.port1.postMessage({
      type: 'set-body',
      payload: { body: '<main><p data-prose-index="1">Existing</p></main>', documentVersion: 'v1' },
    });
    await new Promise((r) => { setTimeout(r, 50); });
  };

  beforeEach(() => {
    url = window.location.href;
    channel = new MessageChannel();
  });

  afterEach(() => {
    channel.port1.close();
    channel.port2.close();
    sinon.restore();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', url);
  });

  it('rejects drops while read-only and accepts them again once cleared', async () => {
    await start(true);
    expect(await resolveDrop('a')).to.not.equal(null);
    await setReadOnly(true);
    expect(await resolveDrop('b')).to.equal(null);
    await setReadOnly(false);
    expect(await resolveDrop('c')).to.not.equal(null);
  });

  it('does not unlock a user without write permission', async () => {
    await start(false);
    await setReadOnly(false);
    expect(await resolveDrop('a')).to.equal(null);
  });

  it('closes an open editor and makes it non-editable', async () => {
    await start(true);
    const editorParent = document.createElement('div');
    editorParent.className = 'prosemirror-editor';
    const inner = document.createElement('div');
    inner.className = 'ProseMirror';
    editorParent.append(inner);
    const setProps = sinon.spy();
    editorParent.view = { setProps };
    document.body.append(editorParent);
    const blur = sinon.spy(inner, 'blur');
    await setReadOnly(true);
    expect(blur.calledOnce).to.equal(true);
    expect(setProps.calledOnce).to.equal(true);
  });
});
