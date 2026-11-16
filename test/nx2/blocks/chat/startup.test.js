import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../../nx2/blocks/chat/chat.js';
import ChatBackend from '../../../../nx2/blocks/chat/chat-backend.js';
import { CHAT_EVENT } from '../../../../nx2/utils/chat.js';
import { resetMockIms } from '../../../../nx2/test/mocks/ims.js';
import {
  getRoomKey, resetSession, saveMessages,
} from '../../../../nx2/blocks/chat/utils/persistence.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe('chat startup', () => {
  let sandbox;
  let chat;
  let releaseHistory;
  let startup;
  let room;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    resetMockIms();
  });

  afterEach(async () => {
    releaseHistory?.resolve();
    chat?.remove();
    await startup;
    sandbox.restore();
    if (room) await resetSession(room, crypto.randomUUID());
    resetMockIms();
  });

  async function setup({ history = [], autoSend = true } = {}) {
    const context = { org: 'test-org', site: `startup-${crypto.randomUUID()}`, view: 'browse' };
    room = getRoomKey({ ...context, userId: 'test-user@AdobeID' });
    const sessionId = crypto.randomUUID();
    await saveMessages(room, history, sessionId);

    const historyStarted = deferred();
    releaseHistory = deferred();
    const loadInitial = ChatBackend.prototype.loadInitialMessages;
    sandbox.stub(ChatBackend.prototype, 'loadInitialMessages').callsFake(async function restore() {
      const loading = loadInitial.call(this);
      historyStarted.resolve();
      await releaseHistory.promise;
      await loading;
    });

    const requests = [];
    const originalFetch = window.fetch;
    const fetch = sandbox.stub(window, 'fetch').callsFake(async (resource, options) => {
      if (resource !== 'https://agent.da.live/chat') return originalFetch(resource, options);
      if (options.method === 'HEAD') return new Response(null, { status: 200 });
      requests.push(JSON.parse(options.body));
      const events = [
        { type: 'text-delta', delta: 'Done' }, { type: 'text-end' }, { type: 'finish' },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    chat = document.createElement('nx-chat');
    chat._explicitContext = true;
    sandbox.stub(chat, '_loadConfig').resolves();
    document.body.append(chat);
    await chat.updateComplete;
    const ensureController = sandbox.spy(chat, '_ensureController');
    const completed = new Promise((resolve) => {
      chat.addEventListener(CHAT_EVENT.TURN_COMPLETED, resolve, { once: true });
    });
    const prompt = 'Analyse this block and return the saved result.';
    chat.context = context;
    startup = ensureController.firstCall.returnValue;
    chat.setPrompt(prompt, { autoSend });
    await historyStarted.promise;
    await chat.updateComplete;
    return {
      requests, fetch, completed, prompt, sessionId,
    };
  }

  it('keeps a cold-chat automatic prompt queued until history restoration finishes', async () => {
    const { requests, completed, prompt, sessionId } = await setup();
    expect(chat.connected).not.to.equal(true);
    expect(requests).to.have.lengthOf(0);
    releaseHistory.resolve();
    await completed;
    expect(requests).to.have.lengthOf(1);
    expect(requests[0].messages).to.deep.equal([{ role: 'user', content: prompt }]);
    expect(requests[0].sessionId).to.equal(sessionId);
  });

  it('includes restored messages and session in the first automatic request', async () => {
    const history = [
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
    ];
    const { requests, completed, prompt, sessionId } = await setup({ history });
    expect(chat.connected).not.to.equal(true);
    expect(requests).to.have.lengthOf(0);
    releaseHistory.resolve();
    await completed;
    expect(requests).to.have.lengthOf(1);
    expect(requests[0].messages).to.deep.equal([...history, { role: 'user', content: prompt }]);
    expect(requests[0].sessionId).to.equal(sessionId);
  });

  it('prefills a queued manual prompt without sending until form submission', async () => {
    const { requests, completed, prompt, sessionId } = await setup({ autoSend: false });
    releaseHistory.resolve();
    await startup;
    await chat.updateComplete;
    expect(chat.connected).to.equal(true);
    expect(requests).to.have.lengthOf(0);
    const input = chat.shadowRoot.querySelector('.chat-input');
    expect(input.value).to.equal(prompt);
    input.closest('form').requestSubmit();
    await completed;
    expect(requests).to.have.lengthOf(1);
    expect(requests[0].messages).to.deep.equal([{ role: 'user', content: prompt }]);
    expect(requests[0].sessionId).to.equal(sessionId);
  });

  it('does not connect or submit a queued prompt if detached while restoring history', async () => {
    const { requests, fetch } = await setup();
    chat.remove();
    releaseHistory.resolve();
    await startup;
    expect(fetch.calledWith('https://agent.da.live/chat')).to.equal(false);
    expect(requests).to.have.lengthOf(0);
  });
});
