import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx2/scripts/nx.js';
import { CHAT_EVENT } from '../../../../nx2/utils/chat.js';
import BaseChatController from '../../../../nx2/blocks/chat-ao/base-chat-controller.js';
import CoworkerChatController from '../../../../nx2/blocks/chat-ao/coworker-chat-controller.js';
import CmaChatController from '../../../../nx2/blocks/chat-ao/cma-chat-controller.js';
import { AO_EVENT, AO_FRAME } from '../../../../nx2/blocks/chat-ao/ao-constants.js';

await setConfig({ hostnames: [] });
await import('../../../../nx2/blocks/chat-ao/chat-ao.js');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => { requestAnimationFrame(resolve); });

describe('standalone input and full AO chat sharing', () => {
  let elements;
  let sockets;
  let originals;
  let episodeLoads;
  let skillLoads;
  let history;
  let org;

  const patch = (object, name, value) => {
    const original = object[name];
    originals.push(() => { object[name] = original; });
    object[name] = value;
  };
  const flush = async () => {
    await tick();
    await Promise.all(elements.filter((el) => el.isConnected).map(async (el) => {
      await el.updateComplete;
      await el._input?.updateComplete;
    }));
  };
  const composer = (chat) => (chat.localName === 'nx-ao-input' ? chat : chat._input);
  const input = (chat) => composer(chat).shadowRoot.querySelector('.chat-input');
  const pills = (chat) => composer(chat).shadowRoot.querySelector('nx-pills');
  const submit = (chat, text) => {
    input(chat).value = text;
    composer(chat).shadowRoot.querySelector('form').requestSubmit();
  };
  const stop = (chat) => {
    const button = composer(chat).shadowRoot.querySelector('.chat-stop');
    button.focus();
    button.click();
  };
  const frameCount = (type) => sockets.flatMap((socket) => socket.frames)
    .filter((frame) => frame.type === type).length;
  const mount = async (options = {}) => {
    const chat = document.createElement(options.standalone ? 'nx-ao-input' : 'nx-chat-ao');
    chat.context = { org, site: 'site', path: '/first', ...options.context };
    chat.isolated = !!options.isolated;
    if (options.onSubmit) chat.onSubmit = options.onSubmit;
    if (options.addEvent) chat.addEvent = options.addEvent;
    if (!options.resolveHarness) {
      chat.harnessConfig = {
        key: `${chat._context.org}/${chat._context.site}`,
        altHarness: options.harness === 'cma',
        activationKey: options.activationKey ?? null,
      };
    }
    elements.push(chat);
    document.body.append(chat);
    await chat._sessionReady;
    await chat.updateComplete;
    await chat._input?.updateComplete;
    return chat;
  };
  const pair = (harness) => Promise.all([
    mount({ harness, standalone: true }), mount({ harness }),
  ]);
  const ready = async (...chats) => {
    await Promise.all(chats.map(async (chat) => {
      await chat._sessionReady;
      await chat._session.ready;
    }));
    await flush();
  };
  const receive = (type, data = {}) => sockets.at(-1).receive(type, data);

  beforeEach(() => {
    org = `shared-${crypto.randomUUID()}`;
    elements = [];
    sockets = [];
    originals = [];
    episodeLoads = 0;
    skillLoads = 0;
    history = [];
    const originalFetch = window.fetch;
    patch(window, 'fetch', async (resource, options) => {
      const href = String(resource);
      if (href.startsWith('/') || href.startsWith(window.location.origin)) {
        return originalFetch(resource, options);
      }
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    });
    patch(BaseChatController.prototype, '_connectionInfo', async () => ({
      authFrame: { type: AO_FRAME.AUTH }, wsBase: 'wss://chat.test',
    }));
    patch(BaseChatController.prototype, '_resolveManifest', async () => ({ manifestId: 'test' }));
    patch(BaseChatController.prototype, '_loadCachedSkills', async () => []);
    const fetchSkills = async () => {
      skillLoads += 1;
      return [{ name: 'writeBlog', description: 'Write a blog post' }];
    };
    patch(BaseChatController.prototype, '_fetchSkills', fetchSkills);
    patch(CmaChatController.prototype, '_fetchSkills', fetchSkills);
    patch(CoworkerChatController.prototype, '_fetchEpisodes', async () => {
      episodeLoads += 1;
      return history;
    });
    patch(CoworkerChatController.prototype, '_fetchEpisodeMessages', async () => [
      { role: 'user', content: 'Resumed conversation' },
    ]);
    patch(CoworkerChatController.prototype, '_fetchEpisodeContext', async () => null);
    patch(CoworkerChatController.prototype, '_fetchWarmSession', async () => {});
    patch(window, 'WebSocket', class extends EventTarget {
      static OPEN = 1;

      constructor(url) {
        super();
        this.url = url;
        this.frames = [];
        this.readyState = 0;
        sockets.push(this);
        queueMicrotask(() => {
          if (this.readyState !== 0) return;
          this.readyState = 1;
          this.dispatchEvent(new Event('open'));
        });
      }

      send(raw) {
        const frame = JSON.parse(raw);
        this.frames.push(frame);
        if (frame.type === AO_FRAME.AUTH) {
          const episode = this.url.split('/').at(-1);
          queueMicrotask(() => this.receive(AO_EVENT.SESSION_READY, {}, {
            episode_id: episode === 'new' ? `episode-${sockets.length}` : episode,
          }));
        }
      }

      receive(type, data, extra = {}) {
        this.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type, data, ...extra }),
        }));
      }

      close() {
        this.readyState = 3;
        this.dispatchEvent(new Event('close'));
      }
    });
  });

  afterEach(async () => {
    elements.forEach((element) => element.remove());
    await tick();
    elements.forEach((element) => {
      const { org: ownerOrg, site } = element._context;
      sessionStorage.removeItem(`nx2:cma-episode:${ownerOrg}/${site}`);
    });
    originals.reverse().forEach((restore) => restore());
  });

  ['coworker', 'cma'].forEach((harness) => {
    [false, true].forEach((standalone) => {
      const view = standalone ? 'compact' : 'full';
      const holdStartup = () => {
        const pending = deferred();
        patch(BaseChatController.prototype, 'loadSkills', () => pending.promise);
        return pending;
      };
      const userFrames = () => sockets.flatMap((socket) => socket.frames)
        .filter((frame) => frame.type === AO_FRAME.USER_INPUT);

      it(`${harness} ${view}: sends a startup prompt once after its session is ready`, async () => {
        const pending = holdStartup();
        history = [{ id: 'existing', updated_at: new Date().toISOString() }];
        const chat = await mount({ harness, standalone });
        const prompt = chat.setPrompt('Automatic startup prompt', { autoSend: true });
        await flush();
        expect(userFrames()).to.have.length(0);
        pending.resolve();
        await ready(chat);
        await prompt;
        await flush();
        expect(userFrames()).to.have.length(1);
        expect(userFrames()[0].text).to.equal('Automatic startup prompt');
        const { controller } = chat._session;
        expect(controller._messages.at(-1).content).to.equal('Automatic startup prompt');
        if (harness === 'coworker') {
          expect(controller._episodeId).to.equal('existing');
          expect(controller._messages[0].content).to.equal('Resumed conversation');
        }
        expect(input(chat).value).to.equal('');
      });

      it(`${harness} ${view}: keeps manual prefill immediate without sending on readiness`, async () => {
        const pending = holdStartup();
        const chat = await mount({ harness, standalone });
        await chat.setPrompt('Manual startup prompt');
        expect(input(chat).value).to.equal('Manual startup prompt');
        expect(userFrames()).to.have.length(0);
        pending.resolve();
        await ready(chat);
        expect(userFrames()).to.have.length(0);
        submit(chat, 'Manual startup prompt');
        await flush();
        expect(userFrames()).to.have.length(1);
      });

      it(`${harness} ${view}: only sends the latest prompt received during startup`, async () => {
        const pending = holdStartup();
        const chat = await mount({ harness, standalone });
        const first = chat.setPrompt('First prompt', { autoSend: true });
        await flush();
        const second = chat.setPrompt('Second prompt', { autoSend: true });
        await flush();
        pending.resolve();
        await ready(chat);
        await Promise.all([first, second]);
        await flush();
        expect(userFrames()).to.have.length(1);
        expect(userFrames()[0].text).to.equal('Second prompt');
      });

      it(`${harness} ${view}: does not submit a startup prompt after the draft is edited`, async () => {
        const pending = holdStartup();
        const chat = await mount({ harness, standalone });
        const prompt = chat.setPrompt('Original prompt', { autoSend: true });
        await flush();
        input(chat).value = 'Author edit';
        input(chat).dispatchEvent(new Event('input'));
        pending.resolve();
        await ready(chat);
        await prompt;
        await flush();
        expect(userFrames()).to.have.length(0);
        expect(input(chat).value).to.equal('Author edit');
      });

      it(`${harness} ${view}: cancels a pending auto-send when a manual prompt replaces it`, async () => {
        const pending = holdStartup();
        const chat = await mount({ harness, standalone });
        const prompt = chat.setPrompt('Automatic prompt', { autoSend: true });
        await flush();
        await chat.setPrompt('Review this manually');
        pending.resolve();
        await ready(chat);
        await prompt;
        await flush();
        expect(userFrames()).to.have.length(0);
        expect(input(chat).value).to.equal('Review this manually');
      });

      it(`${harness} ${view}: cancels the startup prompt on removal even if a sibling keeps the session`, async () => {
        const pending = holdStartup();
        const [compact, full] = await pair(harness);
        const chat = standalone ? compact : full;
        const sibling = standalone ? full : compact;
        const prompt = chat.setPrompt('Detached prompt', { autoSend: true });
        await flush();
        chat.remove();
        pending.resolve();
        await ready(sibling);
        await prompt;
        await flush();
        expect(userFrames()).to.have.length(0);
      });

      it(`${harness} ${view}: does not send the old prompt into a changed site`, async () => {
        const pending = holdStartup();
        const chat = await mount({ harness, standalone });
        const prompt = chat.setPrompt('Old site prompt', { autoSend: true });
        await flush();
        chat.context = { org, site: 'other-site', path: '/other' };
        chat.harnessConfig = {
          key: `${org}/other-site`, harness, altHarness: harness === 'cma',
        };
        await flush();
        pending.resolve();
        await ready(chat);
        await prompt;
        await flush();
        expect(userFrames()).to.have.length(0);
      });

      it(`${harness} ${view}: does not submit after session initialization fails`, async () => {
        const pending = deferred();
        patch(BaseChatController.prototype, 'loadSkills', async () => {
          await pending.promise;
          throw new Error('Startup unavailable');
        });
        const chat = await mount({ harness, standalone });
        const prompt = chat.setPrompt('Do not send', { autoSend: true });
        await flush();
        let failure;
        const unsubscribe = chat._session.subscribe({}, {
          onUpdate: (state) => { failure = state.messages; },
        });
        try {
          pending.resolve();
          await ready(chat);
          await prompt;
          await flush();
          expect(userFrames()).to.have.length(0);
          expect(failure.at(-1).content).to.equal('Error: Startup unavailable');
        } finally {
          unsubscribe();
        }
      });
    });

    it(`${harness}: queues a document prompt until harness configuration creates the session`, async () => {
      patch(customElements.get('nx-chat-ao').prototype, '_loadConfig', async () => {});
      const full = await mount({ harness, resolveHarness: true });
      expect(full._session).to.equal(undefined);
      document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
        detail: { target: full, text: 'Prompt before flags', autoSend: true },
      }));
      await flush();
      expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(0);
      full.harnessConfig = { key: `${org}/site`, harness, altHarness: harness === 'cma' };
      await ready(full);
      await flush();
      expect(full._controller).to.be.instanceOf(harness === 'cma'
        ? CmaChatController : CoworkerChatController);
      expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
      expect(full._controller._messages.at(-1).content).to.equal('Prompt before flags');
    });

    it(`${harness}: cancels a prompt when the site changes during composer delegation`, async () => {
      const full = await mount({ harness });
      await ready(full);
      const delegate = full._input.setPrompt.bind(full._input);
      patch(full._input, 'setPrompt', (...args) => {
        const sending = delegate(...args);
        full.context = { org, site: 'other-site', path: '/other' };
        full.harnessConfig = { key: `${org}/other-site`, harness, altHarness: harness === 'cma' };
        return sending;
      });
      await full.setPrompt('Old site prompt', { autoSend: true });
      await ready(full);
      await flush();
      expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(0);
    });

    it(`${harness}: preserves an edited draft while harness configuration is still pending`, async () => {
      patch(customElements.get('nx-chat-ao').prototype, '_loadConfig', async () => {});
      const full = await mount({ harness, resolveHarness: true });
      await full.setPrompt('Automatic prompt', { autoSend: true });
      input(full).value = 'Author draft';
      input(full).dispatchEvent(new Event('input'));
      full.harnessConfig = { key: `${org}/site`, harness, altHarness: harness === 'cma' };
      await ready(full);
      await flush();
      expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(0);
      expect(input(full).value).to.equal('Author draft');
    });

    it(`${harness}: pairs compact/full views without merging separate conversations`, async () => {
      history = [{ id: 'existing', updated_at: new Date().toISOString() }];
      const first = await mount({ harness });
      const second = await mount({ harness });
      const compact = await mount({ harness, standalone: true });
      const secondCompact = await mount({ harness, standalone: true });
      await ready(first, second, compact, secondCompact);
      expect(compact._session).to.equal(first._session);
      expect(secondCompact._session).to.equal(second._session);
      expect(first._session).not.to.equal(second._session);
      expect(first._input._session).to.equal(undefined);
      expect(second._input._session).to.equal(undefined);
      if (harness === 'coworker') {
        expect(first.episodeId).to.equal('existing');
        expect(second.episodeId).to.equal(undefined);
      }
      submit(secondCompact, 'Only the second conversation');
      await flush();
      expect(first.thinking).not.to.equal(true);
      expect(compact.blocked).to.equal(false);
      expect(second.messages.at(-1).content).to.equal('Only the second conversation');
      expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
    });

    it(`${harness}: uses one live controller and accepts one send across the composer and full chat`, async () => {
      const [standalone, full] = await pair(harness);
      await ready(standalone, full);
      expect(standalone._session).to.equal(full._session);
      expect(skillLoads).to.equal(1);
      if (harness === 'coworker') expect(episodeLoads).to.equal(1);
      expect(standalone._getSlashItems('write')[1]).to.deep.equal({
        id: 'writeBlog', label: '/writeBlog', description: 'Write a blog post',
      });
      expect(full._input._getSlashItems('write')).to.deep.equal(standalone._getSlashItems('write'));
      pills(full).add({ id: 'local', label: 'Local context' });
      submit(standalone, 'From standalone');
      submit(full, 'Keep my draft');
      await flush();
      expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
      expect(sockets).to.have.length(1);
      expect(standalone.draft).to.equal('');
      expect(input(full).value).to.equal('Keep my draft');
      expect(pills(full).items).to.have.length(1);
      expect(input(standalone).disabled).to.equal(true);
      expect(input(full).disabled).to.equal(true);
      expect(full.messages[0].content).to.equal('From standalone');
      receive(AO_EVENT.TEXT_DELTA, { content: 'Shared stream' });
      await flush();
      expect(full.messages.at(-1)).to.include({ content: 'Shared stream', streaming: true });
      expect(full.shadowRoot.querySelector('.message-assistant').textContent)
        .to.include('Shared stream');
      stop(full);
      await flush();
      expect(standalone.blocked).to.equal(false);
      expect(full.thinking).to.equal(false);
      expect(frameCount(AO_FRAME.INTERRUPT)).to.equal(1);
      submit(full, 'From full chat');
      await flush();
      expect(standalone.blocked).to.equal(true);
      expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(2);
      expect(full.messages.at(-1).content).to.equal('From full chat');
      stop(standalone);
      await flush();
      expect(full.thinking).to.equal(false);
      expect(frameCount(AO_FRAME.INTERRUPT)).to.equal(2);
    });

    it(`${harness}: forwards completion events through the shared session without replaying them`, async () => {
      const [standalone, full] = await pair(harness);
      await ready(standalone, full);
      standalone.context = { ...standalone._context, path: '/compact' };
      const completed = [];
      const onCompleted = (event) => {
        completed.push({
          detail: event.detail, target: event.target, composed: event.composed,
        });
      };
      document.addEventListener(CHAT_EVENT.TURN_COMPLETED, onCompleted);
      try {
        submit(standalone, 'Notify the host');
        await flush();
        receive(AO_EVENT.TEXT_DONE, { content: 'Done' });
        expect(completed).to.have.length(0);
        receive(AO_EVENT.TURN_COMPLETED, { turn_id: 'turn' });
        expect(completed).to.have.length(1);
        expect(completed[0].target).to.equal(full);
        expect(completed[0].composed).to.equal(true);
        expect(completed[0].detail).to.deep.equal({
          org,
          site: 'site',
          path: '/compact',
          sessionId: full._controller._episodeId,
          turnId: 'turn',
          status: 'completed',
        });
        full.remove();
        receive(AO_EVENT.TURN_COMPLETED, { turn_id: 'while-detached' });
        document.body.append(full);
        await ready(full);
        expect(completed).to.have.length(1);
        receive(AO_EVENT.TURN_ABORTED, { turn_id: 'aborted' });
        expect(completed).to.have.length(2);
        expect(completed[1].detail.status).to.equal('aborted');
      } finally {
        document.removeEventListener(CHAT_EVENT.TURN_COMPLETED, onCompleted);
      }
    });

    it(`${harness}: keeps Stop focus in its own composer and does not steal focus on completion`, async () => {
      const [standalone, full] = await pair(harness);
      await ready(standalone, full);
      submit(standalone, 'Stop from compact');
      await flush();
      stop(standalone);
      await flush();
      expect(document.activeElement).to.equal(standalone);
      expect(standalone.shadowRoot.activeElement).to.equal(input(standalone));
      submit(full, 'Stop from full chat');
      await flush();
      stop(full);
      await flush();
      expect(document.activeElement).to.equal(full);
      expect(full.shadowRoot.activeElement).to.equal(full._input);
      expect(full._input.shadowRoot.activeElement).to.equal(input(full));
      submit(full, 'Finish without moving focus');
      await flush();
      const addButton = standalone.shadowRoot.querySelector('.chat-add');
      addButton.focus();
      receive(AO_EVENT.TURN_COMPLETED);
      await flush();
      expect(document.activeElement).to.equal(standalone);
      expect(standalone.shadowRoot.activeElement).to.equal(addButton);
    });

    it(`${harness}: keeps the connection alive when either UI is removed and releases the final owner`, async () => {
      const [standalone, full] = await pair(harness);
      await ready(standalone, full);
      submit(standalone, 'Stay connected');
      await flush();
      const { controller } = standalone._session;
      let destroyed = 0;
      const destroy = controller.destroy.bind(controller);
      controller.destroy = () => {
        destroyed += 1;
        destroy();
      };
      full.remove();
      await flush();
      expect(destroyed).to.equal(0);
      expect(sockets[0].readyState).to.equal(1);
      receive(AO_EVENT.TEXT_DELTA, { content: 'Still live' });
      document.body.append(full);
      await ready(full);
      expect(full._controller).to.equal(controller);
      expect(full.messages.at(-1).content).to.equal('Still live');
      standalone.remove();
      await flush();
      expect(destroyed).to.equal(0);
      receive(AO_EVENT.TEXT_DONE, { content: 'Completed' });
      receive(AO_EVENT.TURN_COMPLETED);
      await flush();
      expect(full.messages.at(-1).content).to.equal('Completed');
      full.remove();
      await flush();
      expect(destroyed).to.equal(1);
      expect(sockets[0].readyState).to.equal(3);
      document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
        detail: { target: standalone, text: 'Disconnected', autoSend: true },
      }));
      await flush();
      expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
    });
  });

  it('keeps drafts and attachments local until initialization accepts a submission', async () => {
    const pending = deferred();
    patch(CoworkerChatController.prototype, '_fetchEpisodes', () => {
      episodeLoads += 1;
      return pending.promise;
    });
    patch(BaseChatController.prototype, '_uploadAttachment', async () => 'artifact');
    const [standalone, full] = await pair('coworker');
    const attachment = { id: 'file', label: 'File', dataBase64: 'ZmlsZQ==' };
    standalone.addItem(attachment);
    pills(full).add({ id: 'other', label: 'Other input' });
    submit(standalone, 'Not ready');
    expect(standalone.draft).to.equal('Not ready');
    expect(standalone.items).to.deep.equal([attachment]);
    expect(episodeLoads).to.equal(1);
    expect(sockets).to.have.length(0);
    pending.resolve([]);
    await ready(standalone, full);
    submit(standalone, standalone.draft);
    await flush();
    expect(standalone.items).to.deep.equal([]);
    expect(pills(full).items).to.have.length(1);
    expect(sockets[0].frames.find((frame) => frame.type === AO_FRAME.USER_INPUT).attachments)
      .to.deep.equal(['artifact']);
  });

  it('resolves the same configured harness for a standalone input and full chat without host callbacks', async () => {
    const fetchDefault = window.fetch;
    window.fetch = (resource, options) => {
      const href = String(resource);
      if (href.startsWith('/') || href.startsWith(window.location.origin)) {
        return fetchDefault(resource, options);
      }
      return Promise.resolve(new Response(JSON.stringify({
        flags: { data: [{ key: 'ew.altHarness', value: 'configured-key' }] },
      })));
    };
    const context = { org: `configured-${org}` };
    const standalone = await mount({ standalone: true, resolveHarness: true, context });
    const full = await mount({ resolveHarness: true, context });
    await flush();
    await ready(standalone, full);
    expect(standalone._session).to.equal(full._session);
    expect(full._controller).to.be.instanceOf(CmaChatController);
    expect(standalone.altHarness).to.equal(true);
    submit(standalone, 'Configured shared session');
    await flush();
    expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
    expect(full.messages[0].content).to.equal('Configured shared session');
  });

  it('shares pending approvals, decisions, new-session and explicit resume with the standalone composer', async () => {
    const [standalone, full] = await pair('coworker');
    await ready(standalone, full);
    const { controller } = standalone._session;
    submit(standalone, 'Ask me');
    await flush();
    receive(AO_EVENT.USER_QUESTION, { questions: [] });
    await flush();
    expect(standalone.blocked).to.equal(true);
    expect(full.shadowRoot.querySelector('nx-question-card').pending).to.equal(full.pendingQuestion);
    await Promise.all([controller.answerQuestion(['yes']), full._controller.answerQuestion(['yes'])]);
    expect(frameCount(AO_FRAME.QUESTION_RESPONSE)).to.equal(1);
    receive(AO_EVENT.PLAN_APPROVAL_REQUEST, { turn_id: 'plan', plan_content: 'A plan' });
    await flush();
    expect(standalone.blocked).to.equal(false);
    expect(full.pendingPlanApproval.planContent).to.equal('A plan');
    await Promise.all([controller.respondToPlanApproval('approve'), full._controller.respondToPlanApproval('approve')]);
    expect(frameCount(AO_FRAME.RESUME)).to.equal(1);
    receive(AO_EVENT.PERMISSION_REQUEST, {
      turn_id: 'permission', pending_calls: [{ id: 'tool', name: 'write', arguments: {} }],
    });
    await flush();
    expect(standalone.blocked).to.equal(true);
    await Promise.all([controller.respondToPermission('tool', true), full._controller.respondToPermission('tool', true)]);
    expect(frameCount(AO_FRAME.PERMISSION_RESPONSE)).to.equal(1);
    receive(AO_EVENT.TURN_COMPLETED);
    await flush();
    full._handleNewSession();
    await flush();
    expect(standalone.blocked).to.equal(false);
    expect(full.messages).to.deep.equal([]);
    expect(controller._episodeId).to.equal(undefined);
    await full._controller.switchEpisode('resumed');
    await flush();
    expect(full.messages[0].content).to.equal('Resumed conversation');
    expect(standalone._session.controller._episodeId).to.equal('resumed');
    expect(standalone._session).to.equal(full._session);
  });

  it('isolates independent chats, org/site, harnesses and activation keys, and rejoins when the input changes scope', async () => {
    const [standalone, full] = await pair('coworker');
    const isolated = await mount({ standalone: true, isolated: true });
    const otherSite = await mount({ context: { site: 'another' } });
    const otherOrg = await mount({ standalone: true, context: { org: `${org}-another` } });
    const cma = await mount({ standalone: true, harness: 'cma', activationKey: 'one' });
    const anotherKey = await mount({ harness: 'cma', activationKey: 'two' });
    await ready(standalone, full, isolated, otherSite, otherOrg, cma, anotherKey);
    const sessions = [standalone, isolated, otherSite, otherOrg, cma, anotherKey]
      .map((chat) => chat._session);
    expect(new Set(sessions).size).to.equal(6);
    submit(isolated, 'Only isolated');
    await flush();
    expect(full.messages).to.deep.equal([]);
    expect(standalone.blocked).to.equal(false);
    stop(isolated);
    const previous = standalone._session;
    standalone.context = { org, site: 'site', path: '/other-view', view: 'edit' };
    expect(standalone._session).to.equal(previous);
    standalone.context = { org, site: 'another', path: '/other-view' };
    await ready(standalone);
    expect(standalone._session).to.equal(otherSite._session);
    expect(full._session).to.equal(previous);
  });

  it('preserves host callbacks instead of creating another session for a controlled input', async () => {
    const sent = [];
    const full = await mount();
    const controlled = await mount({
      standalone: true, onSubmit: (payload) => sent.push(payload),
    });
    await ready(full);
    expect(controlled._session).to.equal(undefined);
    submit(controlled, 'Use the host callback');
    expect(sent[0].text).to.equal('Use the host callback');
    expect(full.messages).to.deep.equal([]);
    expect(episodeLoads).to.equal(1);
    expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(0);
  });

  it('routes document prompts and context to one composer, without broadcasting into isolated sessions', async () => {
    const [standalone, full] = await Promise.all([
      mount({ standalone: true, addEvent: CHAT_EVENT.ADD_TO_CHAT }), mount(),
    ]);
    await ready(standalone, full);
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
      detail: { org, site: 'site', text: 'Once', autoSend: true },
    }));
    await flush();
    expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
    expect(full.messages[0].content).to.equal('Once');
    stop(full);
    await flush();
    const isolated = await mount({ standalone: true, isolated: true });
    await ready(isolated);
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, {
      detail: { target: standalone, id: 'local', label: 'Only standalone' },
    }));
    expect(standalone.items).to.have.length(1);
    expect(pills(full).items ?? []).to.have.length(0);
    expect(isolated.items).to.deep.equal([]);
    expect(isolated.blocked).to.equal(false);
    input(full).blur();
    input(standalone).blur();
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
      detail: { text: 'Ambiguous', autoSend: true },
    }));
    await flush();
    expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
  });

  it('cancels a standalone upload stopped from the full chat before a socket is created', async () => {
    const upload = deferred();
    patch(BaseChatController.prototype, '_uploadAttachment', () => upload.promise);
    const [standalone, full] = await pair('coworker');
    await ready(standalone, full);
    standalone.addItem({ id: 'file', label: 'File', dataBase64: 'ZmlsZQ==' });
    submit(standalone, 'Upload this');
    await flush();
    stop(full);
    upload.resolve('artifact');
    await flush();
    expect(sockets).to.have.length(0);
    expect(standalone.blocked).to.equal(false);
    expect(full.thinking).to.equal(false);
  });

  it('does not open a pending socket after the last input/chat subscriber disconnects', async () => {
    const connection = deferred();
    patch(BaseChatController.prototype, '_connectionInfo', () => connection.promise);
    const [standalone, full] = await pair('coworker');
    await ready(standalone, full);
    submit(standalone, 'Connect');
    await flush();
    standalone.remove();
    full.remove();
    connection.resolve({ authFrame: { type: AO_FRAME.AUTH }, wsBase: 'wss://chat.test' });
    await flush();
    expect(sockets).to.have.length(0);
  });

  it('accepts a new full-chat send after Stop while the compact input upload is still pending', async () => {
    const upload = deferred();
    patch(BaseChatController.prototype, '_uploadAttachment', () => upload.promise);
    const [standalone, full] = await pair('coworker');
    await ready(standalone, full);
    standalone.addItem({ id: 'file', label: 'File', dataBase64: 'ZmlsZQ==' });
    submit(standalone, 'Cancelled upload');
    await flush();
    stop(full);
    await flush();
    submit(full, 'Send after Stop');
    await flush();
    expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
    expect(full.messages.at(-1).content).to.equal('Send after Stop');
    upload.resolve('artifact');
    await flush();
    expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
    expect(standalone.blocked).to.equal(true);
  });

  it('resets both consumers during a slow resume without restoring stale history or leaving them loading', async () => {
    const messages = deferred();
    patch(CoworkerChatController.prototype, '_fetchEpisodeMessages', () => messages.promise);
    const [standalone, full] = await pair('coworker');
    await ready(standalone, full);
    const resume = full._controller.switchEpisode('slow');
    full._handleNewSession();
    messages.resolve([{ role: 'user', content: 'Stale history' }]);
    await resume;
    await flush();
    expect(full.loadingEpisode).to.equal(false);
    expect(full.messages).to.deep.equal([]);
    submit(standalone, 'Fresh start');
    await flush();
    expect(frameCount(AO_FRAME.USER_INPUT)).to.equal(1);
  });

  it('preserves Coworker auto-resume for the pair without attaching an isolated input', async () => {
    history = [{ id: 'existing', updated_at: new Date().toISOString() }];
    const standalone = await mount({ standalone: true });
    const full = await mount();
    const isolated = await mount({ standalone: true, isolated: true });
    await ready(standalone, full, isolated);
    expect(standalone._session).to.equal(full._session);
    expect(full.episodeId).to.equal('existing');
    expect(isolated._session.controller._episodeId).to.equal(undefined);
    expect(sockets).to.have.length(1);
  });

  it('preserves CMA resume across compact/full lifetimes without changing the existing storage key', async () => {
    const standalone = await mount({ standalone: true, harness: 'cma', activationKey: 'one' });
    const isolated = await mount({ standalone: true, harness: 'cma', isolated: true, activationKey: 'two' });
    await ready(standalone, isolated);
    submit(standalone, 'Persist this session');
    await flush();
    const episodeId = standalone._session.controller._episodeId;
    expect(sessionStorage.getItem(`nx2:cma-episode:${org}/site`)).to.equal(episodeId);
    stop(standalone);
    standalone.remove();
    const full = await mount({ harness: 'cma', activationKey: 'one' });
    await ready(full);
    expect(full.episodeId).to.equal(episodeId);
    expect(isolated._session.controller._episodeId).to.equal(undefined);
  });
});
