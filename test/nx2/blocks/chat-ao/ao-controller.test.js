import { expect } from '@esm-bundle/chai';
import AoChatController from '../../../../nx2/blocks/chat-ao/ao-controller.js';

function makeController() {
  const updates = [];
  const sent = [];
  const controller = new AoChatController({ onUpdate: (u) => updates.push(u) });
  controller._ensureSocket = async () => { };
  controller._authFrame = async () => ({ type: 'AUTH' });
  controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };
  return { controller, updates, sent };
}

describe('ao-controller sendMessage', () => {
  it('sends AUTH followed by USER_INPUT, without waiting on any ready signal', async () => {
    const { controller, updates, sent } = makeController();

    await controller.sendMessage('hello AO');

    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'hello AO' }]);
    expect(updates[0].thinking).to.equal(true);
    expect(sent).to.deep.equal([
      { type: 'AUTH' },
      { type: 'USER_INPUT', text: 'hello AO', manifestId: 'experience-workspace', debugMode: true },
    ]);
  });

  it('is a no-op while a turn is already in flight', async () => {
    const { controller, sent } = makeController();
    controller._thinking = true;

    await controller.sendMessage('hello again');

    expect(sent).to.have.length(0);
  });

  it('prefixes selected context items into the wire text, not the shown message', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('what does this do?', [
      { type: 'block', blockName: 'hero', id: 'a' },
      { type: 'text', innerHTML: '<p>hello <b>world</b></p>', id: 'b' },
    ]);

    expect(controller._messages).to.deep.equal([{
      role: 'user',
      content: 'what does this do?',
      selectionContext: [
        { type: 'block', blockName: 'hero' },
        { type: 'text', innerHTML: '<p>hello <b>world</b></p>' },
      ],
    }]);
    expect(sent[1].text).to.equal(
      '[Selected context]\n- Selected block: hero\n- Selected text: "hello world"\nwhat does this do?',
    );
  });

  it('prefixes the current page context, once setContext has been called', async () => {
    const { controller, sent } = makeController();
    controller.setContext({ org: 'adobe', site: 'da-live', path: '/docs/foo' });

    await controller.sendMessage('what does this do?');

    expect(sent[1].text).to.equal(
      '[Current document — org: adobe, site: da-live, path: /docs/foo]\nwhat does this do?',
    );
  });

  it('omits the page-context prefix when no context has been set', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('hello AO');

    expect(sent[1].text).to.equal('hello AO');
  });

  it('is a no-op for an empty message', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('');

    expect(sent).to.have.length(0);
  });

  it('surfaces a socket failure as an assistant error and clears thinking', async () => {
    const { controller, updates } = makeController();
    controller._ensureSocket = async () => { throw new Error('AO WebSocket error'); };

    await controller.sendMessage('hello AO');

    expect(controller._messages.at(-1)).to.deep.equal({
      role: 'assistant', content: 'Error: AO WebSocket error',
    });
    expect(updates.at(-1).thinking).to.equal(false);
  });
});

describe('ao-controller streamed text', () => {
  it('accumulates TEXT_DELTA into streamingText', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent({ type: 'text_delta', data: { content: 'Hel' } });
    controller._handleServerEvent({ type: 'text_delta', data: { content: 'lo' } });

    expect(updates.at(-1).streamingText).to.equal('Hello');
  });

  it('finalizes TEXT_DONE into a message and clears streamingText', () => {
    const { controller, updates } = makeController();
    controller._streaming = 'Hello';

    controller._handleServerEvent({ type: 'text_done', data: { content: 'Hello there' } });

    expect(controller._messages).to.deep.equal([{ role: 'assistant', content: 'Hello there' }]);
    expect(updates.at(-1).streamingText).to.equal(undefined);
  });
});

describe('ao-controller turn lifecycle', () => {
  it('clears thinking on TURN_COMPLETED', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;

    controller._handleServerEvent({ type: 'turn_completed' });

    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('surfaces a session-level error as an assistant message', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;

    controller._handleServerEvent({ type: 'error', data: { message: 'model unavailable' } });

    expect(controller._messages).to.deep.equal([
      { role: 'assistant', content: 'Error: model unavailable' },
    ]);
    expect(updates.at(-1).thinking).to.equal(false);
  });
});

describe('ao-controller episodes', () => {
  it('loadEpisodes hydrates the latest episode and its messages', async () => {
    const { controller, updates } = makeController();
    controller._fetchEpisodes = async () => [
      { id: '2', title: 'Latest' }, { id: '1', title: 'Older' },
    ];
    controller._fetchEpisodeMessages = async (id) => [{ role: 'user', content: `hi from ${id}` }];

    await controller.loadEpisodes();

    expect(controller._episodeId).to.equal('2');
    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'hi from 2' }]);
    expect(updates.at(-1).episodes).to.deep.equal([
      { id: '2', title: 'Latest' }, { id: '1', title: 'Older' },
    ]);
    expect(updates.at(-1).episodeId).to.equal('2');
  });

  it('loadEpisodes is a no-op hydration when there are no prior episodes', async () => {
    const { controller, updates } = makeController();
    controller._fetchEpisodes = async () => [];

    await controller.loadEpisodes();

    expect(controller._episodeId).to.equal(undefined);
    expect(updates.at(-1).episodes).to.deep.equal([]);
  });

  it('switchEpisode hydrates the picked episode and resets the socket', async () => {
    const { controller, updates } = makeController();
    controller._episodeId = '1';
    controller._ws = { close: () => { controller._ws = null; } };
    controller._fetchEpisodeMessages = async (id) => [{ role: 'assistant', content: `from ${id}` }];

    await controller.switchEpisode('2');

    expect(controller._episodeId).to.equal('2');
    expect(controller._ws).to.equal(null);
    expect(updates.at(-1).messages).to.deep.equal([{ role: 'assistant', content: 'from 2' }]);
  });

  it('switchEpisode is a no-op for the already-active episode or mid-turn', async () => {
    const { controller } = makeController();
    controller._episodeId = '1';
    let called = false;
    controller._fetchEpisodeMessages = async () => {
      called = true;
      return [];
    };

    await controller.switchEpisode('1');
    expect(called).to.equal(false);

    controller._thinking = true;
    await controller.switchEpisode('2');
    expect(called).to.equal(false);
  });

  it('startNewEpisode clears the active episode so the next send starts fresh', () => {
    const { controller, updates } = makeController();
    controller._episodeId = '1';
    controller._messages = [{ role: 'user', content: 'hi' }];
    controller._ws = { close: () => {} };

    controller.startNewEpisode();

    expect(controller._episodeId).to.equal(undefined);
    expect(controller._ws).to.equal(null);
    expect(updates.at(-1).messages).to.deep.equal([]);
  });

  it('captures the episode id from SESSION_READY and refreshes the episode list on a new episode', async () => {
    const { controller, updates } = makeController();
    controller._fetchEpisodes = async () => [{ id: '3', title: 'Brand new' }];

    controller._handleServerEvent({ type: 'SESSION_READY', episode_id: '3' });

    expect(controller._episodeId).to.equal('3');
    await Promise.resolve();
    expect(updates.at(-1).episodes).to.deep.equal([{ id: '3', title: 'Brand new' }]);
  });

  it('ignores a SESSION_READY that repeats the already-active episode id', () => {
    const { controller, updates } = makeController();
    controller._episodeId = '1';
    controller._fetchEpisodes = async () => { throw new Error('should not refetch'); };

    controller._handleServerEvent({ type: 'SESSION_READY', episode_id: '1' });

    expect(controller._episodeId).to.equal('1');
    expect(updates).to.have.length(0);
  });
});

describe('ao-controller stop', () => {
  it('stop sends an INTERRUPT frame when the socket is open', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;
    controller._ws.readyState = WebSocket.OPEN;
    const sent = [];
    controller._ws.send = (msg) => sent.push(JSON.parse(msg));

    controller.stop();

    expect(sent).to.deep.equal([{ type: 'INTERRUPT' }]);
    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('stop is a no-op send when there is no open socket, but still clears thinking', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;
    controller._ws = null;

    controller.stop();

    expect(updates.at(-1).thinking).to.equal(false);
  });
});
