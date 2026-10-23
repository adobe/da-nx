import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../nx2/scripts/nx.js';
import { registerPanelSection, PANEL_EVENT } from '../../../../nx2/utils/panel.js';
import { CHAT_EVENT } from '../../../../nx2/utils/chat.js';
import { setupPanels } from '../../../../nx/blocks/shell/panels.js';
import decorate from '../../../../nx/blocks/shell/shell.js';

const pause = () => new Promise((resolve) => { setTimeout(resolve, 10); });

async function waitFor(predicate) {
  for (let i = 0; i < 300; i += 1) {
    if (predicate()) return;
    await pause();
  }
  throw new Error('Timed out waiting for the shell panel.');
}

describe('nx2 fullscreen shell', () => {
  let originalUrl;
  let originalTitle;
  let block;
  let prompt;
  let log;
  const ports = [];

  before(async () => {
    await setConfig();
    await import('../../../../nx2/blocks/chat/chat.js');
  });

  beforeEach(async () => {
    originalUrl = window.location.href;
    originalTitle = document.title;
    history.replaceState(null, '', '/app/adobe/demo/tools/open-chat/open-chat?nxver=2&ref=local');
    log = sinon.spy();
    await setConfig({ log });
    const Chat = customElements.get('nx-chat');
    sinon.stub(Chat.prototype, '_ensureController');
    sinon.stub(Chat.prototype, '_loadConfig');
    prompt = sinon.stub(Chat.prototype, 'setPrompt');

    const fetch = window.fetch.bind(window);
    sinon.stub(window, 'fetch').callsFake((resource, options) => {
      if (String(resource).includes('/ping/')) {
        return Promise.resolve(new Response(''));
      }
      if (String(resource).includes('/config/')) {
        return Promise.resolve(new Response(JSON.stringify({ flags: { data: [] } })));
      }
      return fetch(resource, options);
    });
    sinon.stub(HTMLIFrameElement.prototype, 'src').set(function setSrc(value) {
      this.dataset.appSrc = value;
    });
    const meta = document.createElement('meta');
    meta.name = 'template';
    meta.content = 'app-frame';
    meta.dataset.shellTest = '';
    document.head.append(meta);
    const main = document.createElement('main');
    main.dataset.shellTest = '';
    main.innerHTML = '<div class="section"><div class="block-content"><div class="nx-shell"></div></div></div>';
    document.body.append(main);
    block = main.querySelector('.nx-shell');
  });

  afterEach(() => {
    ports.forEach((port) => port.close());
    ports.length = 0;
    document.querySelectorAll('[data-shell-test], aside.panel, .disclaimer').forEach((el) => el.remove());
    localStorage.removeItem('nx-panels');
    document.body.style.removeProperty('--app-frame-areas');
    document.body.style.removeProperty('--app-frame-columns');
    history.replaceState(null, '', originalUrl);
    document.title = originalTitle;
    sinon.restore();
  });

  async function connectApp() {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await decorate(block);
    expect(log.called).to.equal(false);
    const iframe = block.querySelector('iframe');
    expect(iframe).to.exist;
    const send = sinon.stub(iframe.contentWindow, 'postMessage');
    await clock.tickAsync(750);
    clock.restore();
    expect(send.called).to.equal(true);
    send.getCalls().forEach((call) => ports.push(call.args[2][0]));
    return { iframe, port: send.firstCall.args[2][0], message: send.firstCall.args[0] };
  }

  it('preserves the app URL and SDK handshake when hosted by nx2', async () => {
    const { iframe, message, port } = await connectApp();
    expect(iframe.dataset.appSrc).to.equal('http://localhost:3000/tools/open-chat/open-chat.html?nxver=2&ref=local');
    expect(message.ready).to.equal(true);
    expect(message.token).to.equal('test-token');
    expect(message.context.org).to.equal('adobe');
    expect(message.context.repo).to.equal('demo');
    expect(message.context.path).to.equal('tools/open-chat/open-chat');
    expect(document.querySelector('aside.panel')).to.equal(null);
    port.postMessage({ action: 'setTitle', details: 'Fullscreen demo' });
    await waitFor(() => document.title === 'Fullscreen demo');
    expect(document.adoptedStyleSheets.some((sheet) => sheet.path?.includes('/shell/shell.css'))).to.equal(true);
  });

  it('opens chat and sends the first prompt after the chat is mounted', async () => {
    const { port } = await connectApp();
    port.postMessage({ action: 'setPrompt', details: { text: 'Hello', autoSend: true } });
    await waitFor(() => prompt.called);
    const aside = document.querySelector('aside.panel[data-section="chat"]');
    expect(aside.hidden).to.equal(false);
    expect(prompt.firstCall.args).to.deep.equal(['Hello', { autoSend: true }]);
    expect(aside.querySelector('nx-chat')._context).to.deep.equal({
      org: 'adobe', site: 'demo', path: null, view: 'browse',
    });
    expect(document.body.style.getPropertyValue('--app-frame-columns')).to.contain('400px');
  });

  it('uses the target-site hash instead of the app hosting repository', async () => {
    history.replaceState(null, '', `${window.location.href}#/target-org/target-site/page`);
    const { port } = await connectApp();
    port.postMessage({ action: 'setPrompt', details: { text: 'Target site' } });
    await waitFor(() => prompt.called);
    const chat = document.querySelector('aside.panel nx-chat');
    expect(chat._context).to.include({
      org: 'target-org', site: 'target-site', path: 'page', view: 'browse',
    });
    expect(prompt.firstCall.args).to.deep.equal(['Target site', { autoSend: false }]);
  });

  it('supports setPrompt and reopens the same chat after closing it', async () => {
    const { port } = await connectApp();
    port.postMessage({ action: 'setPrompt', details: { text: 'First' } });
    await waitFor(() => prompt.calledOnce);
    const aside = document.querySelector('aside.panel');
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
    expect(aside.hidden).to.equal(true);
    port.postMessage({ action: 'setPrompt', details: { text: 'Second' } });
    await waitFor(() => prompt.calledTwice);
    expect(aside.hidden).to.equal(false);
    expect(document.querySelectorAll('aside.panel').length).to.equal(1);
    expect(prompt.secondCall.args[0]).to.equal('Second');
  });

  it('opens chat without a prompt through showPanel', async () => {
    const { port } = await connectApp();
    port.postMessage({ action: 'showPanel', details: 'chat' });
    await waitFor(() => document.querySelector('aside.panel nx-chat'));
    expect(prompt.called).to.equal(false);
  });

  it('opens other registered panels through showPanel', async () => {
    const { port } = await connectApp();
    registerPanelSection('demo-tools', {
      position: 'after',
      getContent: async () => document.createElement('div'),
    });
    port.postMessage({ action: 'showPanel', details: 'demo-tools' });
    await waitFor(() => document.querySelector('aside.panel[data-section="demo-tools"]'));
    expect(prompt.called).to.equal(false);
  });

  it('reports malformed chat commands without opening a panel', () => {
    const onMessage = setupPanels({ org: 'adobe', repo: 'demo' });
    onMessage({ action: 'setPrompt', details: { text: 42 } });
    expect(log.calledOnce).to.equal(true);
    expect(document.querySelector('aside.panel')).to.equal(null);
  });

  it('does not forward unrelated SDK commands as chat prompts', () => {
    const listener = sinon.spy();
    document.addEventListener(CHAT_EVENT.SET_PROMPT, listener);
    setupPanels({ org: 'adobe', repo: 'demo' })({ action: 'setTitle', details: 'Title' });
    document.removeEventListener(CHAT_EVENT.SET_PROMPT, listener);
    expect(listener.called).to.equal(false);
  });
});
