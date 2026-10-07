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
    expect(clickPayload(span)).to.deep.equal({ target: new URL('/about', window.location).href, source: 'ew-wysiwyg-layout' });
  });

  it('uses the media src as target', () => {
    document.body.innerHTML = '<img src="/media_1.png">';
    expect(clickPayload(document.querySelector('img')).target)
      .to.equal(new URL('/media_1.png', window.location).href);
  });

  it('honours data-rum-target', () => {
    document.body.innerHTML = '<p data-rum-target="https://example.com/x">x</p>';
    expect(clickPayload(document.querySelector('p'))).to.deep.equal({ target: 'https://example.com/x', source: 'ew-wysiwyg-layout' });
  });

  it('has no target for plain content, like RUM', () => {
    document.body.innerHTML = '<div class="hero block"><p>hello</p></div>';
    expect(clickPayload(document.querySelector('p'))).to.deep.equal({ target: undefined, source: 'ew-wysiwyg-layout' });
  });

  it('stays defensive when given no element', () => {
    expect(clickPayload(null)).to.deep.equal({ target: undefined, source: 'ew-wysiwyg-layout' });
  });

  it('carries only the target and layout source', () => {
    document.body.innerHTML = '<p>x</p>';
    expect(Object.keys(clickPayload(document.querySelector('p')))).to.deep.equal(['target', 'source']);
  });

  it('attributes nested editable text to the layout source', () => {
    document.body.innerHTML = '<div class="hero block"><p data-prose-index="3"><strong>hi</strong></p></div>';
    expect(clickPayload(document.querySelector('strong')).source).to.equal('ew-wysiwyg-layout');
  });

  it('attributes active inline text editors to the layout source', () => {
    document.body.innerHTML = `<div class="prosemirror-editor" data-prose-index="3">
      <div class="ProseMirror" contenteditable="true"><p><strong>hi</strong></p></div>
    </div>`;
    expect(clickPayload(document.querySelector('strong'))).to.deep.equal({
      target: undefined,
      source: 'ew-wysiwyg-layout',
    });
  });

  it('flags clicks on blocks, images and overlays as the layout source', () => {
    document.body.innerHTML = `<div class="hero block" data-block-index="1"><p data-prose-index="3"><picture><img src="/a.png"></picture></p></div>
      <div id="qe-selection-overlay"><div class="qe-selected-pill">hero</div></div>`;
    expect(clickPayload(document.querySelector('.hero')).source).to.equal('ew-wysiwyg-layout');
    expect(clickPayload(document.querySelector('img')).source).to.equal('ew-wysiwyg-layout');
    expect(clickPayload(document.querySelector('.qe-selected-pill')).source).to.equal('ew-wysiwyg-layout');
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
    expect(posted[0].payload).to.deep.equal({ target: undefined, source: 'ew-wysiwyg-layout' });

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

  it('forwards editable text clicks as layout even when propagation is stopped', () => {
    document.body.innerHTML = '<p data-prose-index="3"><strong>hi</strong></p>';
    const posted = [];
    const cleanup = installClickForwarding({
      target: document,
      getPort: () => ({ postMessage: (message) => posted.push(message) }),
    });
    try {
      const text = document.querySelector('strong');
      text.addEventListener('click', (event) => event.stopPropagation());
      text.click();
      expect(posted).to.deep.equal([{
        type: MESSAGE_TYPES.IFRAME_CLICK,
        payload: { target: undefined, source: 'ew-wysiwyg-layout' },
      }]);
    } finally {
      cleanup();
    }
  });
});
