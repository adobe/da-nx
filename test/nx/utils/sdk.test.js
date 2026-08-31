import { expect } from '@esm-bundle/chai';

describe('DA_SDK actions.scrollTo', () => {
  let actions;
  let received;

  before(async () => {
    const { default: DA_SDK } = await import('../../../nx/utils/sdk.js');
    const channel = new MessageChannel();
    received = [];
    channel.port1.onmessage = (e) => {
      received.push(e.data);
    };
    channel.port1.start();

    window.postMessage(
      { ready: true, project: { org: 'myorg', repo: 'mysite' } },
      window.location.origin,
      [channel.port2],
    );

    ({ actions } = await DA_SDK);
  });

  beforeEach(() => {
    received.length = 0;
  });

  function waitForMessage() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  it('posts a block target', async () => {
    actions.scrollTo({ type: 'block', blockIndex: 3 });
    await waitForMessage();
    expect(received).to.deep.equal([
      { action: 'scrollTo', details: { type: 'block', blockIndex: 3 } },
    ]);
  });

  it('posts a section target', async () => {
    actions.scrollTo({ type: 'section', sectionIndex: 1 });
    await waitForMessage();
    expect(received).to.deep.equal([
      { action: 'scrollTo', details: { type: 'section', sectionIndex: 1 } },
    ]);
  });

  it('posts a content target', async () => {
    actions.scrollTo({ type: 'content', proseIndex: 5, kind: 'heading' });
    await waitForMessage();
    expect(received).to.deep.equal([
      { action: 'scrollTo', details: { type: 'content', proseIndex: 5, kind: 'heading' } },
    ]);
  });
});
