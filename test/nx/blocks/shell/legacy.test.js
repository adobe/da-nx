import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../nx/scripts/nexter.js';

setConfig({ imsClientId: 'legacy-shell-test' });

describe('nx1 fullscreen shell', () => {
  let decorate;
  let imsDetails;
  let originalAdobeIMS;
  let originalAdobeid;
  let originalImsFlag;
  let originalUrl;
  let trustedApps;
  let block;
  let clock;

  before(async () => {
    originalAdobeIMS = window.adobeIMS;
    originalAdobeid = window.adobeid;
    originalImsFlag = localStorage.getItem('nx-ims');
    window.adobeIMS = {
      getAccessToken: () => ({ token: 'legacy-shell-token' }),
      getProfile: async () => ({ email: 'legacy-shell@adobe.com' }),
    };
    const append = document.head.append.bind(document.head);
    const scriptStub = sinon.stub(document.head, 'append').callsFake((...nodes) => {
      if (nodes.some((node) => node.src === 'https://auth.services.adobe.com/imslib/imslib.min.js')) {
        queueMicrotask(() => window.adobeid.onReady());
        return;
      }
      append(...nodes);
    });
    try {
      const { loadIms } = await import('../../../../nx/utils/ims.js');
      imsDetails = await loadIms();
      ({ default: decorate } = await import('../../../../nx/blocks/shell/shell.js'));
    } finally {
      scriptStub.restore();
    }
  });

  after(() => {
    window.adobeIMS = originalAdobeIMS;
    window.adobeid = originalAdobeid;
    if (originalImsFlag === null) localStorage.removeItem('nx-ims');
    else localStorage.setItem('nx-ims', originalImsFlag);
  });

  beforeEach(() => {
    originalUrl = window.location.href;
    trustedApps = localStorage.getItem('trustedApps');
    localStorage.removeItem('trustedApps');
    history.replaceState(null, '', '/app/third-party/demo/tools/app?ref=local');
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    sinon.stub(HTMLIFrameElement.prototype, 'src').set(function setSrc(value) {
      this.dataset.appSrc = value;
    });
    block = document.createElement('div');
    block.className = 'nx-shell';
    document.body.append(block);
  });

  afterEach(() => {
    document.querySelectorAll('.disclaimer').forEach((el) => el.remove());
    block.remove();
    if (trustedApps === null) localStorage.removeItem('trustedApps');
    else localStorage.setItem('trustedApps', trustedApps);
    history.replaceState(null, '', originalUrl);
    sinon.restore();
  });

  it('requires approval before loading an untrusted app and remembers that branch', async () => {
    await decorate(block);
    expect(block.querySelector('iframe')).to.equal(null);
    expect(document.querySelector('.disclaimer')).to.exist;
    await clock.tickAsync(400);
    document.querySelector('sl-button[name="continue"]').click();
    expect(document.querySelector('.disclaimer')).to.equal(null);
    expect(block.querySelector('iframe').dataset.appSrc)
      .to.equal('http://localhost:3000/tools/app.html?ref=local');
    expect(JSON.parse(localStorage.getItem('trustedApps'))['third-party/demo/local']).to.equal(true);
    expect(document.querySelector('aside.panel')).to.equal(null);
  });

  it('loads a previously trusted app without creating nx2 panels', async () => {
    localStorage.setItem('trustedApps', JSON.stringify({ 'third-party/demo/local': true }));
    await decorate(block);
    expect(block.querySelector('iframe')).to.exist;
    expect(document.querySelector('.disclaimer')).to.equal(null);
    expect(document.querySelector('aside.panel')).to.equal(null);
  });

  it('shares the host IMS session in the app SDK handshake', async () => {
    history.replaceState(null, '', '/app/adobe/demo/tools/app?ref=local');
    await decorate(block);
    const iframe = block.querySelector('iframe');
    expect(iframe).to.exist;
    const postMessage = sinon.stub(iframe.contentWindow, 'postMessage');
    await clock.tickAsync(750);
    const [message, , ports] = postMessage.firstCall.args;
    ports.forEach((port) => port.close());
    expect(message.token).to.equal(imsDetails.accessToken.token);
    expect(message.email).to.equal(imsDetails.email);
    expect(message.context.imsOrigin).to.equal('https://ims-na1-stg1.adobelogin.com');
    expect(message.capabilities).to.equal(undefined);
  });
});
