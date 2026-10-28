import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../nx2/scripts/nx.js';
import { registerPanelSection, PANEL_EVENT } from '../../../../nx2/utils/panel.js';
import { CHAT_EVENT } from '../../../../nx2/utils/chat.js';
import { setupPanels } from '../../../../nx/blocks/shell/panels.js';
import decorate from '../../../../nx/blocks/shell/shell.js';
import { createHostActions } from '../../../../nx/utils/sdk.js';

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
  let configs;
  const ports = [];
  const connections = [];

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
    configs = new Map();

    const fetch = window.fetch.bind(window);
    sinon.stub(window, 'fetch').callsFake((resource, options) => {
      if (String(resource).includes('/ping/')) {
        return Promise.resolve(new Response(''));
      }
      if (String(resource).includes('/config/')) {
        const config = configs.get(new URL(resource, window.location.origin).pathname);
        return Promise.resolve(new Response(
          JSON.stringify(config?.body ?? { flags: { data: [] } }),
          { status: config?.status ?? 200 },
        ));
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
    connections.forEach((connection) => connection.destroy());
    connections.length = 0;
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

  async function connectPanels(context) {
    const panels = await setupPanels(context);
    const connection = panels.connect({ postMessage() {} });
    connections.push(connection);
    return connection.onMessage;
  }

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
    expect(message.capabilities).to.deep.equal({ chatTurnCompleted: 1 });
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

  it('delivers turn completion through the fullscreen SDK subscription', async () => {
    const { port, message } = await connectApp();
    const actions = createHostActions({ port, capabilities: message.capabilities });
    const received = sinon.spy();
    const unsubscribe = actions.subscribeChatTurnCompleted(received);
    try {
      await pause();
      const detail = {
        org: 'target-org', site: 'target-site', path: 'page', status: 'completed',
      };
      document.dispatchEvent(new CustomEvent(CHAT_EVENT.TURN_COMPLETED, { detail }));
      await waitFor(() => received.called);
      expect(received.firstCall.args).to.deep.equal([detail]);
      unsubscribe();
      await pause();
      document.dispatchEvent(new CustomEvent(CHAT_EVENT.TURN_COMPLETED, { detail }));
      await pause();
      expect(received.calledOnce).to.equal(true);
    } finally {
      unsubscribe();
    }
  });

  it('cleans up subscriptions when an app connection is replaced', async () => {
    const panels = await setupPanels({ org: 'adobe', repo: 'demo' });
    const oldPort = { postMessage: sinon.spy() };
    const oldConnection = panels.connect(oldPort);
    connections.push(oldConnection);
    oldConnection.onMessage({ action: 'subscribeChatTurnCompleted' });
    oldConnection.onMessage({ action: 'subscribeChatTurnCompleted' });
    const detail = { status: 'aborted' };
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.TURN_COMPLETED, { detail }));
    expect(oldPort.postMessage.calledOnce).to.equal(true);
    oldConnection.destroy();
    const nextPort = { postMessage: sinon.spy() };
    const nextConnection = panels.connect(nextPort);
    connections.push(nextConnection);
    nextConnection.onMessage({ action: 'subscribeChatTurnCompleted' });
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.TURN_COMPLETED, { detail }));
    expect(oldPort.postMessage.calledOnce).to.equal(true);
    expect(nextPort.postMessage.calledOnceWithExactly({
      action: 'chatTurnCompleted', detail,
    })).to.equal(true);
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

  it('reports malformed chat commands without opening a panel', async () => {
    const onMessage = await connectPanels({ org: 'adobe', repo: 'demo' });
    onMessage({ action: 'setPrompt', details: { text: 42 } });
    expect(log.calledOnce).to.equal(true);
    expect(document.querySelector('aside.panel')).to.equal(null);
  });

  it('does not forward unrelated SDK commands as chat prompts', async () => {
    const listener = sinon.spy();
    document.addEventListener(CHAT_EVENT.SET_PROMPT, listener);
    const onMessage = await connectPanels({ org: 'adobe', repo: 'demo' });
    onMessage({ action: 'setTitle', details: 'Title' });
    document.removeEventListener(CHAT_EVENT.SET_PROMPT, listener);
    expect(listener.called).to.equal(false);
  });

  async function assertChatBlocked({ org, site }) {
    const panels = await setupPanels({ org, repo: site });
    expect(panels.capabilities).to.deep.equal({});
    const port = { postMessage: sinon.spy() };
    const connection = panels.connect(port);
    connections.push(connection);
    const { onMessage } = connection;
    onMessage({ action: 'subscribeChatTurnCompleted' });
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.TURN_COMPLETED, {
      detail: { status: 'completed' },
    }));
    expect(port.postMessage.called).to.equal(false);
    const open = sinon.spy();
    document.addEventListener(PANEL_EVENT.OPEN, open);
    try {
      onMessage({ action: 'setPrompt', details: { text: 'Blocked', autoSend: true } });
      onMessage({ action: 'showPanel', details: 'chat' });
      expect(open.called).to.equal(false);
      expect(prompt.called).to.equal(false);
      expect(log.called).to.equal(false);
      expect(document.querySelector('aside.panel')).to.equal(null);
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, open);
    }
    return onMessage;
  }

  it('silently blocks chat disabled in the app org config', async () => {
    history.replaceState(null, '', '/app/chat-disabled-org/demo/tools/app');
    configs.set('/config/chat-disabled-org/', {
      body: { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } },
    });
    await assertChatBlocked({ org: 'chat-disabled-org', site: 'demo' });
  });

  it('silently blocks chat disabled in the app site config without a target hash', async () => {
    history.replaceState(null, '', '/app/adobe/chat-disabled-site/tools/app');
    configs.set('/config/adobe/chat-disabled-site/', {
      body: { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } },
    });
    await assertChatBlocked({ org: 'adobe', site: 'chat-disabled-site' });
  });

  it('enables chat for a hash site even when the app hosting site disables it', async () => {
    history.replaceState(null, '', '/app/adobe/disabled-host/tools/app?ref=local#/exp-workspace/frescopa');
    configs.set('/config/adobe/disabled-host/', {
      body: { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } },
    });
    const { port, message } = await connectApp();
    expect(message.capabilities).to.deep.equal({ chatTurnCompleted: 1 });
    port.postMessage({ action: 'setPrompt', details: { text: 'Target site' } });
    await waitFor(() => prompt.called);
    expect(document.querySelector('aside.panel nx-chat')._context).to.include({
      org: 'exp-workspace', site: 'frescopa', path: null, view: 'browse',
    });
  });

  it('blocks chat when the hash site disables it even though the app host enables it', async () => {
    history.replaceState(null, '', '/app/adobe/demo/tools/app#/target-org/disabled-target');
    configs.set('/config/target-org/disabled-target/', {
      body: { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } },
    });
    await assertChatBlocked({ org: 'adobe', site: 'demo' });
  });

  it('honors the hash org flag when targeting a document', async () => {
    history.replaceState(null, '', '/app/adobe/demo/tools/app#/disabled-target-org/site/page');
    configs.set('/config/disabled-target-org/', {
      body: { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } },
    });
    await assertChatBlocked({ org: 'adobe', site: 'demo' });
  });

  [401, 403].forEach((status) => {
    it(`uses the shared flag defaults when the app config returns ${status}`, async () => {
      const site = `chat-denied-${status}`;
      history.replaceState(null, '', `/app/adobe/${site}/tools/app`);
      configs.set(`/config/adobe/${site}/`, { status });
      const panels = await setupPanels({ org: 'adobe', repo: site });
      expect(panels.capabilities).to.deep.equal({ chatTurnCompleted: 1 });
      const connection = panels.connect({ postMessage() {} });
      connections.push(connection);
      connection.onMessage({ action: 'setPrompt', details: { text: 'Hello' } });
      await waitFor(() => prompt.called);
    });
  });

  ['/app', '/app/adobe', '/apps/adobe/demo'].forEach((path) => {
    it(`silently blocks chat outside a site-app URL: ${path}`, async () => {
      history.replaceState(null, '', path);
      await assertChatBlocked({ org: 'adobe', site: 'demo' });
    });
  });

  it('keeps other registered panels usable when chat is disabled', async () => {
    history.replaceState(null, '', '/app/adobe/chat-disabled-tools/tools/app');
    configs.set('/config/adobe/chat-disabled-tools/', {
      body: { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } },
    });
    const onMessage = await assertChatBlocked({ org: 'adobe', site: 'chat-disabled-tools' });
    registerPanelSection('allowed-tools', {
      position: 'after',
      getContent: async () => document.createElement('div'),
    });
    onMessage({ action: 'showPanel', details: 'allowed-tools' });
    await waitFor(() => document.querySelector('aside.panel[data-section="allowed-tools"]'));
  });
});
