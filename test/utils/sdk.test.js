import { expect } from '@esm-bundle/chai';
import DA_SDK from '../../nx/utils/sdk.js';

const wait = (ms = 20) => new Promise((resolve) => { setTimeout(resolve, ms); });
const fromHost = (data, transfer = []) => window.postMessage(data, '*', transfer);

describe('DA SDK link selection', () => {
  const hostMessages = [];
  let actions;

  before(async () => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => hostMessages.push(e.data);
    fromHost({ ready: true, context: { org: 'org', repo: 'site' } }, [channel.port2]);
    ({ actions } = await DA_SDK);
  });

  it('replays the latest link to new subscribers and stops after unsubscribe', async () => {
    fromHost({ action: 'selectionChange', details: { link: { href: 'https://a.test/x', text: 'x' } } });
    await wait();

    const seen = [];
    const unsubscribe = actions.onSelectionChange((details) => seen.push(details));
    expect(seen).to.deep.equal([{ link: { href: 'https://a.test/x', text: 'x' } }]);

    fromHost({ action: 'selectionChange', details: { link: null } });
    await wait();
    unsubscribe();
    fromHost({ action: 'selectionChange', details: { link: { href: 'https://a.test/y', text: 'y' } } });
    await wait();

    expect(seen).to.deep.equal([
      { link: { href: 'https://a.test/x', text: 'x' } },
      { link: null },
    ]);
  });

  it('ignores selection messages from windows other than the host', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const seen = [];
    const unsubscribe = actions.onSelectionChange((details) => seen.push(details));
    seen.length = 0;

    window.dispatchEvent(new MessageEvent('message', {
      data: { action: 'selectionChange', details: { link: { href: 'https://evil.test', text: 'e' } } },
      source: frame.contentWindow,
    }));
    await wait();

    unsubscribe();
    frame.remove();
    expect(seen).to.deep.equal([]);
  });

  it('asks the host to replace the link and resolves when it confirms', async () => {
    const replaced = actions.replaceLink('<p><a href="https://a.test/new">new</a></p>', { href: 'https://a.test/x' });
    await wait();

    expect(hostMessages.at(-1)).to.deep.equal({
      action: 'replaceLink',
      details: { html: '<p><a href="https://a.test/new">new</a></p>', href: 'https://a.test/x' },
    });

    fromHost({ action: 'replaceLinkResult', details: { ok: true } });
    await replaced;
  });

  it('rejects with the host error when the link cannot be replaced', async () => {
    const replaced = actions.replaceLink('<p>x</p>', { href: 'https://a.test/x' });
    fromHost({ action: 'replaceLinkResult', details: { ok: false, error: 'No link at the selection' } });

    const error = await replaced.then(() => null, (e) => e);
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('No link at the selection');
  });
});
