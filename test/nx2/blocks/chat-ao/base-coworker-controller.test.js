import { expect } from '@esm-bundle/chai';
import BaseChatController from '../../../../nx2/blocks/chat-ao/base-chat-controller.js';
import CoworkerChatController from '../../../../nx2/blocks/chat-ao/coworker-chat-controller.js';
import AoChatController from '../../../../nx2/blocks/chat-ao/ao-controller.js';
import { AO_FRAME } from '../../../../nx2/blocks/chat-ao/ao-constants.js';

// These cover the Base/Coworker split (PR: split controller into Base +
// Coworker subclass). They assert the shared/hook boundary the decoupling
// relies on — see docs/chat-ao-controller-decoupling.md — so a later change to
// one harness can't silently break the contract the other depends on.

function makeBase() {
  const updates = [];
  const sent = [];
  const controller = new BaseChatController({ onUpdate: (u) => updates.push(u) });
  controller._ensureSocket = async () => { };
  controller._ws = { readyState: WebSocket.OPEN, send: (msg) => sent.push(JSON.parse(msg)) };
  return { controller, updates, sent };
}

describe('controller decoupling — re-export identity', () => {
  it('ao-controller is the Coworker controller (historical default export preserved)', () => {
    expect(AoChatController).to.equal(CoworkerChatController);
  });

  it('Coworker extends Base', () => {
    const coworker = new CoworkerChatController({ onUpdate: () => { } });
    expect(coworker).to.be.instanceOf(BaseChatController);
  });
});

describe('BaseChatController — shared attach primitive', () => {
  it('defines _attach and reattachIfIdle so Base reconnect never depends on a subclass', () => {
    expect(BaseChatController.prototype._attach).to.be.a('function');
    expect(BaseChatController.prototype.reattachIfIdle).to.be.a('function');
  });

  it('_attach opens the socket and sends an ATTACH frame', async () => {
    const { controller, sent } = makeBase();
    controller._episodeId = 'ep-1';

    await controller._attach();

    expect(sent).to.deep.equal([{ type: AO_FRAME.ATTACH }]);
  });

  it('reattachIfIdle is a no-op when the socket is already open', async () => {
    const { controller, sent } = makeBase();
    controller._episodeId = 'ep-1';
    // _ws.readyState is OPEN in makeBase

    await controller.reattachIfIdle();

    expect(sent).to.have.length(0);
  });

  it('reattachIfIdle attaches when idle (no live socket) and an episode exists', async () => {
    const { controller, sent } = makeBase();
    controller._episodeId = 'ep-1';
    controller._ws = { readyState: WebSocket.CLOSED, send: (msg) => sent.push(JSON.parse(msg)) };

    await controller.reattachIfIdle();

    expect(sent).to.deep.equal([{ type: AO_FRAME.ATTACH }]);
  });

  it('reattachIfIdle is a no-op without an episode', async () => {
    const { controller, sent } = makeBase();
    controller._ws = { readyState: WebSocket.CLOSED, send: (msg) => sent.push(JSON.parse(msg)) };

    await controller.reattachIfIdle();

    expect(sent).to.have.length(0);
  });
});

describe('BaseChatController — _refreshEpisodeList hook', () => {
  it('is a no-op by default so _onSessionReady is safe without an episode list', async () => {
    const { controller } = makeBase();
    // Default hook must be callable and thenable (callers use .catch()).
    const result = controller._refreshEpisodeList();
    expect(result).to.have.property('then');
    await result; // does not throw
  });

  it('_onSessionReady on a new episode calls _refreshEpisodeList (overridable hook)', () => {
    const { controller } = makeBase();
    let refreshed = 0;
    controller._refreshEpisodeList = () => {
      refreshed += 1;
      return Promise.resolve();
    };

    controller._onSessionReady({ episode_id: 'ep-new' });

    expect(controller._episodeId).to.equal('ep-new');
    expect(refreshed).to.equal(1);
  });

  it('_onSessionReady does not refresh when the episode is unchanged', () => {
    const { controller } = makeBase();
    controller._episodeId = 'ep-same';
    let refreshed = 0;
    controller._refreshEpisodeList = () => {
      refreshed += 1;
      return Promise.resolve();
    };

    controller._onSessionReady({ episode_id: 'ep-same' });

    expect(refreshed).to.equal(0);
  });
});

describe('CoworkerChatController — overrides the episode-list hooks', () => {
  it('provides its own _refreshEpisodeList (not the Base no-op)', () => {
    expect(CoworkerChatController.prototype._refreshEpisodeList)
      .to.not.equal(BaseChatController.prototype._refreshEpisodeList);
  });

  it('inherits the shared _attach/reattachIfIdle from Base', () => {
    expect(CoworkerChatController.prototype._attach)
      .to.equal(BaseChatController.prototype._attach);
    expect(CoworkerChatController.prototype.reattachIfIdle)
      .to.equal(BaseChatController.prototype.reattachIfIdle);
  });

  it('warmSession hits the REST warm endpoint then attaches, once per episode', async () => {
    const sent = [];
    const warmed = [];
    const coworker = new CoworkerChatController({ onUpdate: () => { } });
    coworker._ensureSocket = async () => { };
    coworker._ws = { readyState: WebSocket.OPEN, send: (msg) => sent.push(JSON.parse(msg)) };
    coworker._fetchWarmSession = async (id) => { warmed.push(id); };
    coworker._episodeId = 'ep-1';

    await coworker.warmSession();
    await coworker.warmSession(); // second call is a no-op (already warmed)

    expect(warmed).to.deep.equal(['ep-1']);
    expect(sent).to.deep.equal([{ type: AO_FRAME.ATTACH }]);
  });
});
