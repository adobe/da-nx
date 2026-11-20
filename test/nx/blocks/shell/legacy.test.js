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

  [
    'x</b></p><h2 style="color:#c00;border:2px solid #c00">Trust this app</h2><p>',
    'x</b><img src=x onerror="window.shellInjected=true"><b>&amp;"\'',
  ].forEach((ref) => {
    it(`renders an untrusted branch as text: ${ref}`, async () => {
      history.replaceState(null, '', `/app/third-party/demo/tools/app?${new URLSearchParams({ ref })}`);

      await decorate(block);

      const disclaimer = document.querySelector('.disclaimer');
      expect(disclaimer.querySelectorAll('h2')).to.have.lengthOf(1);
      expect(disclaimer.querySelector('img')).to.equal(null);
      const warning = [...disclaimer.querySelectorAll('p')]
        .find((paragraph) => paragraph.textContent.includes('development version'));
      expect(warning.querySelectorAll('b')).to.have.lengthOf(2);
      expect(warning.querySelectorAll('b')[1].textContent).to.equal(ref);
      expect(block.querySelector('iframe')).to.equal(null);
      expect(localStorage.getItem('trustedApps')).to.equal(null);
      await clock.tickAsync(400);
    });
  });

  it('omits the development warning for the main branch', async () => {
    history.replaceState(null, '', '/app/third-party/demo/tools/app?ref=main');

    await decorate(block);

    const disclaimer = document.querySelector('.disclaimer');
    expect(disclaimer.textContent).not.to.include('development version');
    expect(disclaimer.textContent).to.include('app named app hosted by third-party/demo');
    expect(block.querySelector('iframe')).to.equal(null);
    await clock.tickAsync(400);
  });
});
