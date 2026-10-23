import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import decorate from '../../../../nx/blocks/shell/shell.js';

describe('nx1 fullscreen shell', () => {
  let originalUrl;
  let trustedApps;
  let block;
  let clock;

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
});
