import { expect } from '@esm-bundle/chai';
import { MESSAGE_TYPES } from '../../../../../nx/utils/message-types.js';
import {
  clickPayload,
  installClickForwarding,
} from '../../../../../nx/public/plugins/quick-edit/src/click-forwarding.js';

describe('quick-edit click payload', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('uses the link href as target', () => {
    document.body.innerHTML = '<div class="hero block"><a href="/about"><span>go</span></a></div>';
    const span = document.querySelector('span');
    expect(clickPayload(span)).to.deep.equal({ target: new URL('/about', window.location).href });
  });

  it('uses the media src as target', () => {
    document.body.innerHTML = '<img src="/media_1.png">';
    expect(clickPayload(document.querySelector('img')).target)
      .to.equal(new URL('/media_1.png', window.location).href);
  });

  it('honours data-rum-target', () => {
    document.body.innerHTML = '<p data-rum-target="https://example.com/x">x</p>';
    expect(clickPayload(document.querySelector('p'))).to.deep.equal({ target: 'https://example.com/x' });
  });

  it('has no target for plain content, like RUM', () => {
    document.body.innerHTML = '<div class="hero block"><p>hello</p></div>';
    expect(clickPayload(document.querySelector('p'))).to.deep.equal({ target: undefined });
  });

  it('stays defensive when given no element', () => {
    expect(clickPayload(null)).to.deep.equal({ target: undefined });
  });

  it('carries no host-specific (RUM) fields', () => {
    document.body.innerHTML = '<p>x</p>';
    expect(Object.keys(clickPayload(document.querySelector('p')))).to.deep.equal(['target']);
  });
});

describe('quick-edit click forwarding', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('posts an IFRAME_CLICK message with the payload through the live port on click', () => {
    document.body.innerHTML = '<div class="hero block"><button>save</button></div>';
    const posted = [];
    const port = { postMessage: (m) => posted.push(m) };
    const cleanup = installClickForwarding({ target: document, getPort: () => port });

    document.querySelector('button').click();

    expect(posted).to.have.length(1);
    expect(posted[0].type).to.equal(MESSAGE_TYPES.IFRAME_CLICK);
    expect(posted[0].type).to.equal('iframe-click');
    expect(posted[0].payload).to.deep.equal({ target: undefined });

    cleanup();
    document.querySelector('button').click();
    expect(posted).to.have.length(1);
  });

  it('does not throw or post when no port is available', () => {
    document.body.innerHTML = '<button>x</button>';
    const cleanup = installClickForwarding({ target: document, getPort: () => null });
    expect(() => document.querySelector('button').click()).to.not.throw();
    cleanup();
  });
});
