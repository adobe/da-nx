import { expect } from '@esm-bundle/chai';
import DA_SDK, { UI_SIZE_EVENT } from '../../nx/utils/sdk.js';

const post = (data, opts = {}) => window.dispatchEvent(new MessageEvent('message', { data, ...opts }));

describe('SDK ui size', () => {
  let sdk;
  let channel;

  before(async () => {
    channel = new MessageChannel();
    post({ ready: true, context: { org: 'o', uiSize: 'm' } }, { ports: [channel.port2] });
    sdk = await DA_SDK;
  });

  after(() => {
    document.body.classList.remove('ui-size-m');
    channel.port1.close();
  });

  it('exposes the host ui size and mirrors it on body', () => {
    expect(sdk.context.uiSize).to.equal('m');
    expect(document.body.classList.contains('ui-size-m')).to.be.true;
  });

  it('follows uiSizeChange from the parent and dispatches an event', () => {
    const sizes = [];
    const onChange = ({ detail }) => sizes.push(detail.size);
    document.addEventListener(UI_SIZE_EVENT, onChange);
    post({ action: 'uiSizeChange', detail: { uiSize: 's' } }, { source: window.parent });
    expect(document.body.classList.contains('ui-size-m')).to.be.false;
    post({ action: 'uiSizeChange', detail: { uiSize: 'm' } }, { source: window.parent });
    expect(document.body.classList.contains('ui-size-m')).to.be.true;
    document.removeEventListener(UI_SIZE_EVENT, onChange);
    expect(sizes).to.deep.equal(['s', 'm']);
  });

  it('ignores invalid sizes', () => {
    post({ action: 'uiSizeChange', detail: { uiSize: 'xl' } }, { source: window.parent });
    expect(document.body.classList.contains('ui-size-m')).to.be.true;
  });
});
