import { expect } from '@esm-bundle/chai';
import { MESSAGE_TYPES } from '../../../../../nx/utils/message-types.js';
import {
  rumClickPayload,
  installRumClickForwarding,
} from '../../../../../nx/public/plugins/quick-edit/src/rum-click.js';

describe('quick-edit rum-click payload', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('labels the source as the wysiwyg surface and uses the link href as target', () => {
    document.body.innerHTML = '<div class="hero block"><a href="/about"><span>go</span></a></div>';
    const span = document.querySelector('span');
    expect(rumClickPayload(span)).to.deep.equal({ source: 'ew-wysiwyg-doc', target: '/about' });
  });

  it('uses the enclosing block name as target when there is no link', () => {
    document.body.innerHTML = '<div class="hero block"><p>hello</p></div>';
    const p = document.querySelector('p');
    expect(rumClickPayload(p)).to.deep.equal({ source: 'ew-wysiwyg-doc', target: 'hero' });
  });

  it('falls back to the element tag name for bare content', () => {
    document.body.innerHTML = '<main><p>plain</p></main>';
    const p = document.querySelector('p');
    expect(rumClickPayload(p)).to.deep.equal({ source: 'ew-wysiwyg-doc', target: 'p' });
  });

  it('stays defensive when given no element', () => {
    expect(rumClickPayload(null)).to.deep.equal({ source: 'ew-wysiwyg-doc', target: undefined });
  });
});

describe('quick-edit rum-click forwarding', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('posts a RUM_CLICK message with the payload through the live port on click', () => {
    document.body.innerHTML = '<div class="hero block"><button>save</button></div>';
    const posted = [];
    const port = { postMessage: (m) => posted.push(m) };
    const cleanup = installRumClickForwarding({ target: document, getPort: () => port });

    document.querySelector('button').click();

    expect(posted).to.have.length(1);
    expect(posted[0].type).to.equal(MESSAGE_TYPES.RUM_CLICK);
    expect(posted[0].payload).to.deep.equal({ source: 'ew-wysiwyg-doc', target: 'hero' });

    cleanup();
    document.querySelector('button').click();
    expect(posted).to.have.length(1);
  });

  it('does not throw or post when no port is available', () => {
    document.body.innerHTML = '<button>x</button>';
    const cleanup = installRumClickForwarding({ target: document, getPort: () => null });
    expect(() => document.querySelector('button').click()).to.not.throw();
    cleanup();
  });
});
