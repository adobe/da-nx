import { expect } from '@esm-bundle/chai';
import AoChatController from '../../../../nx2/blocks/chat-ao/ao-controller.js';

function makeController() {
  const updates = [];
  const sent = [];
  const controller = new AoChatController({ onUpdate: (u) => updates.push(u) });
  controller._ensureSocket = async () => { };
  controller._fetchEpisodeContext = async () => null;
  controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };
  return { controller, updates, sent };
}

describe('ao-controller sendMessage', () => {
  it('sends USER_INPUT without waiting on any ready signal', async () => {
    const { controller, updates, sent } = makeController();

    await controller.sendMessage('hello AO');

    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'hello AO' }]);
    expect(updates[0].thinking).to.equal(true);
    expect(sent).to.deep.equal([
      { type: 'USER_INPUT', text: 'hello AO', manifestId: 'experience-workspace', debugMode: true },
    ]);
  });

  it('never sends AUTH itself — that is _ensureSocket\'s job, once per connection, not per message', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('first');
    await controller.sendMessage('second');

    expect(sent.filter((f) => f.type === 'AUTH')).to.have.length(0);
  });

  it('is a no-op while a turn is already in flight', async () => {
    const { controller, sent } = makeController();
    controller._thinking = true;

    await controller.sendMessage('hello again');

    expect(sent).to.have.length(0);
  });

  it('is still a no-op while a question is pending — that flow stays blocking', async () => {
    const { controller, sent } = makeController();
    controller._thinking = true;
    controller._pendingQuestion = { turnId: 't1', context: null, questions: [] };

    await controller.sendMessage('hello again');

    expect(sent).to.have.length(0);
  });

  it('is allowed while only a plan approval is pending — that flow is non-blocking', async () => {
    const { controller, sent } = makeController();
    controller._thinking = true;
    controller._pendingPlanApproval = { turnId: 't1', planContent: '# Plan', planFilePath: null };

    await controller.sendMessage('looks good, go ahead');

    expect(sent).to.deep.equal([
      { type: 'USER_INPUT', text: 'looks good, go ahead', manifestId: 'experience-workspace', debugMode: true },
    ]);
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
    expect(sent[0].text).to.equal(
      '[Selected context]\n- Selected block: hero\n- Selected text: "hello world"\nwhat does this do?',
    );
  });

  it('prefixes the current page context, once setContext has been called', async () => {
    const { controller, sent } = makeController();
    controller.setContext({ org: 'adobe', site: 'da-live', path: '/docs/foo' });

    await controller.sendMessage('what does this do?');

    expect(sent[0].text).to.equal(
      '[Current document — org: adobe, site: da-live, path: /docs/foo]\nwhat does this do?',
    );
  });

  it('omits the page-context prefix when no context has been set', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('hello AO');

    expect(sent[0].text).to.equal('hello AO');
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

  it('swallows a session-level error silently when not thinking — e.g. a background warmSession ATTACH failing', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent({ type: 'error', data: { message: 'not active' } });

    expect(controller._messages).to.deep.equal([]);
    expect(updates).to.have.length(0);
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

  it('loadEpisodes hydrates a pending question left over from a suspended turn', async () => {
    const { controller, updates } = makeController();
    controller._fetchEpisodes = async () => [{ id: '2', title: 'Latest' }];
    controller._fetchEpisodeMessages = async () => [];
    controller._fetchEpisodeContext = async () => ({
      type: 'question', turnId: 't1', context: 'Please confirm.', questions: [{ id: '1' }],
    });

    await controller.loadEpisodes();

    expect(controller._pendingQuestion).to.deep.equal({
      type: 'question', turnId: 't1', context: 'Please confirm.', questions: [{ id: '1' }],
    });
    expect(controller._pendingPlanApproval).to.equal(undefined);
    expect(updates.at(-1).pendingQuestion).to.deep.equal(controller._pendingQuestion);
    expect(updates.at(-1).thinking).to.equal(true);
  });

  it('loadEpisodes hydrates a pending plan approval left over from a suspended turn', async () => {
    const { controller, updates } = makeController();
    controller._fetchEpisodes = async () => [{ id: '2', title: 'Latest' }];
    controller._fetchEpisodeMessages = async () => [];
    controller._fetchEpisodeContext = async () => ({
      type: 'plan', turnId: 't1', planContent: '# Plan', planFilePath: '.ao/plans/x.md',
    });

    await controller.loadEpisodes();

    expect(controller._pendingPlanApproval).to.deep.equal({
      type: 'plan', turnId: 't1', planContent: '# Plan', planFilePath: '.ao/plans/x.md',
    });
    expect(controller._pendingQuestion).to.equal(undefined);
    expect(updates.at(-1).pendingPlanApproval).to.deep.equal(controller._pendingPlanApproval);
    expect(updates.at(-1).thinking).to.equal(true);
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

  it('switchEpisode is allowed while a question is pending — it is suspended, not actively streaming', async () => {
    const { controller } = makeController();
    controller._episodeId = '1';
    controller._thinking = true;
    controller._pendingQuestion = { turnId: 't1', context: null, questions: [] };
    controller._ws = { close: () => { controller._ws = null; } };
    controller._fetchEpisodeMessages = async (id) => [{ role: 'assistant', content: `from ${id}` }];

    await controller.switchEpisode('2');

    expect(controller._episodeId).to.equal('2');
    expect(controller._pendingQuestion).to.equal(undefined);
  });

  it('switchEpisode is allowed while a plan approval is pending — it is suspended, not actively streaming', async () => {
    const { controller } = makeController();
    controller._episodeId = '1';
    controller._thinking = true;
    controller._pendingPlanApproval = { turnId: 't1', planContent: '# Plan', planFilePath: null };
    controller._ws = { close: () => { controller._ws = null; } };
    controller._fetchEpisodeMessages = async (id) => [{ role: 'assistant', content: `from ${id}` }];

    await controller.switchEpisode('2');

    expect(controller._episodeId).to.equal('2');
    expect(controller._pendingPlanApproval).to.equal(undefined);
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

  it('startNewEpisode is allowed while a question is pending, and clears it', () => {
    const { controller, updates } = makeController();
    controller._episodeId = '1';
    controller._thinking = true;
    controller._pendingQuestion = { turnId: 't1', context: null, questions: [] };
    controller._ws = { close: () => {} };

    controller.startNewEpisode();

    expect(controller._episodeId).to.equal(undefined);
    expect(controller._pendingQuestion).to.equal(undefined);
    expect(updates.at(-1).pendingQuestion).to.equal(undefined);
    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('startNewEpisode is allowed while a plan approval is pending, and clears it', () => {
    const { controller, updates } = makeController();
    controller._episodeId = '1';
    controller._thinking = true;
    controller._pendingPlanApproval = { turnId: 't1', planContent: '# Plan', planFilePath: null };
    controller._ws = { close: () => {} };

    controller.startNewEpisode();

    expect(controller._episodeId).to.equal(undefined);
    expect(controller._pendingPlanApproval).to.equal(undefined);
    expect(updates.at(-1).pendingPlanApproval).to.equal(undefined);
    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('startNewEpisode still refuses to abandon an actively streaming turn', () => {
    const { controller } = makeController();
    controller._episodeId = '1';
    controller._thinking = true;
    let closed = false;
    controller._ws = { close: () => { closed = true; } };

    controller.startNewEpisode();

    expect(closed).to.equal(false);
    expect(controller._episodeId).to.equal('1');
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

  it('patches the matching episode title on EPISODE_TITLE_UPDATED', () => {
    const { controller, updates } = makeController();
    controller._episodes = [{ id: '1', title: null }, { id: '2', title: 'Other episode' }];

    controller._handleServerEvent({
      type: 'episode_title_updated',
      data: { episode_id: '1', title: 'Generated title' },
    });

    expect(updates.at(-1).episodes).to.deep.equal([
      { id: '1', title: 'Generated title' },
      { id: '2', title: 'Other episode' },
    ]);
  });

  it('leaves other episodes untouched when one title updates', () => {
    const { controller, updates } = makeController();
    controller._episodes = [{ id: '1', title: null }];

    controller._handleServerEvent({
      type: 'episode_title_updated',
      data: { episode_id: 'unknown-id', title: 'Generated title' },
    });

    expect(updates.at(-1).episodes).to.deep.equal([{ id: '1', title: null }]);
  });
});

describe('ao-controller skills', () => {
  it('getSkills starts out empty when nothing is cached', () => {
    const { controller } = makeController();
    expect(controller.getSkills()).to.deep.equal([]);
  });

  it('loadSkills refreshes the list from the API', async () => {
    const { controller } = makeController();
    controller._fetchSkills = async () => ['writeBlog', 'summarize'];

    await controller.loadSkills();

    expect(controller.getSkills()).to.deep.equal(['writeBlog', 'summarize']);
  });

  it('loadSkills leaves the current list in place on a failed fetch', async () => {
    const { controller } = makeController();
    controller._skills = ['writeBlog'];
    controller._fetchSkills = async () => null;

    await controller.loadSkills();

    expect(controller.getSkills()).to.deep.equal(['writeBlog']);
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

describe('ao-controller user questions', () => {
  const sampleEvent = {
    type: 'user_question',
    turn_id: 't1',
    context_id: 'c1',
    data: {
      turn_id: 't1',
      tool_call_id: 'tooluse_1',
      context: 'This is an example of how I pause and ask for your approval.',
      questions: [{
        id: '1',
        header: 'Publish page',
        multi_select: false,
        options: [{ label: 'Approve' }, { label: 'Decline' }],
        question: "I'm about to publish the page. Should I proceed?",
        required: true,
      }],
    },
  };

  it('surfaces a USER_QUESTION event as pendingQuestion', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent(sampleEvent);

    expect(updates.at(-1).pendingQuestion).to.deep.equal({
      turnId: 't1',
      context: 'This is an example of how I pause and ask for your approval.',
      questions: sampleEvent.data.questions,
    });
  });

  it('answerQuestion sends QUESTION_RESPONSE directly over an already-open socket, and clears pendingQuestion', async () => {
    const { controller, updates, sent } = makeController();
    controller._handleServerEvent(sampleEvent);
    controller._ws.readyState = WebSocket.OPEN;

    await controller.answerQuestion([{ question_id: '1', selected_options: ['Approve'] }]);

    expect(sent).to.deep.equal([{
      type: 'QUESTION_RESPONSE',
      turn_id: 't1',
      answers: [{ question_id: '1', selected_options: ['Approve'] }],
      declined: false,
    }]);
    expect(updates.at(-1).pendingQuestion).to.equal(undefined);
  });

  it('declineQuestion sends QUESTION_RESPONSE with declined: true and no answers, over an open socket', async () => {
    const { controller, sent } = makeController();
    controller._handleServerEvent(sampleEvent);
    controller._ws.readyState = WebSocket.OPEN;

    await controller.declineQuestion();

    expect(sent).to.deep.equal([{
      type: 'QUESTION_RESPONSE', turn_id: 't1', answers: [], declined: true,
    }]);
  });

  it('answerQuestion is a no-op when there is no pending question', async () => {
    const { controller, sent } = makeController();

    await controller.answerQuestion([{ question_id: '1', selected_options: ['Approve'] }]);

    expect(sent).to.have.length(0);
  });

  it('answerQuestion resumes via RESUME when a question was hydrated with no live socket', async () => {
    // Mirrors switching to / reloading an episode left mid-question: the WS
    // is only opened lazily, so there's no live connection to send a plain
    // QUESTION_RESPONSE over — AO also rejects it as an invalid first op.
    const { controller, sent } = makeController();
    controller._pendingQuestion = { turnId: 't1', context: null, questions: [] };
    controller._ws = null;
    controller._ensureSocket = async () => {
      controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };
    };

    await controller.answerQuestion([{ question_id: '1', selected_options: ['Approve'] }]);

    expect(sent).to.deep.equal([{
      type: 'RESUME',
      turn_id: 't1',
      data: {
        type: 'question-response',
        answers: [{ question_id: '1', selected_options: ['Approve'] }],
        declined: false,
      },
    }]);
  });

  it('declineQuestion resumes via RESUME when a question was hydrated with no live socket', async () => {
    const { controller, sent } = makeController();
    controller._pendingQuestion = { turnId: 't1', context: null, questions: [] };
    controller._ws = null;
    controller._ensureSocket = async () => {
      controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };
    };

    await controller.declineQuestion();

    expect(sent).to.deep.equal([{
      type: 'RESUME',
      turn_id: 't1',
      data: { type: 'question-response', answers: [], declined: true },
    }]);
  });
});

describe('ao-controller plan approval', () => {
  const sampleEvent = {
    type: 'plan_approval_request',
    turn_id: 't1',
    context_id: 'c1',
    data: {
      turn_id: 't1',
      plan_file_path: '.ao/plans/x.md',
      plan_content: '# Plan\n\n## Todos\n\n- [ ] Do the thing\n',
    },
  };

  it('surfaces a PLAN_APPROVAL_REQUEST event as pendingPlanApproval', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent(sampleEvent);

    expect(updates.at(-1).pendingPlanApproval).to.deep.equal({
      turnId: 't1',
      planContent: sampleEvent.data.plan_content,
      planFilePath: '.ao/plans/x.md',
    });
  });

  it('respondToPlanApproval sends a RESUME frame with a plan-response part, and clears pendingPlanApproval', async () => {
    const { controller, updates, sent } = makeController();
    controller._handleServerEvent(sampleEvent);

    await controller.respondToPlanApproval('reject', 'needs more detail');

    expect(sent).to.deep.equal([{
      type: 'RESUME',
      turn_id: 't1',
      data: {
        type: 'plan-response', decision: 'reject', feedback: 'needs more detail', edited_plan_content: null,
      },
    }]);
    expect(updates.at(-1).pendingPlanApproval).to.equal(undefined);
  });

  it('respondToPlanApproval is a no-op when there is no pending plan approval', async () => {
    const { controller, sent } = makeController();

    await controller.respondToPlanApproval('approve');

    expect(sent).to.have.length(0);
  });

  it('respondToPlanApproval always uses RESUME, even with no live socket — unlike questions, it has no direct response frame to fall back to', async () => {
    const { controller, sent } = makeController();
    controller._pendingPlanApproval = { turnId: 't1', planContent: '# Plan', planFilePath: null };
    controller._ws = null;
    controller._ensureSocket = async () => {
      controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };
    };

    await controller.respondToPlanApproval('approve');

    expect(sent).to.deep.equal([{
      type: 'RESUME',
      turn_id: 't1',
      data: {
        type: 'plan-response', decision: 'approve', feedback: '', edited_plan_content: null,
      },
    }]);
  });

  it('clears a stale pendingPlanApproval once text streams again, even without an explicit decision — e.g. AO resolving it via conversational_resume', () => {
    const { controller, updates } = makeController();
    controller._handleServerEvent(sampleEvent);

    controller._handleServerEvent({ type: 'text_delta', data: { content: 'Sure' } });

    expect(updates.at(-1).pendingPlanApproval).to.equal(undefined);
  });
});

describe('ao-controller warmSession', () => {
  it('warms the current episode once, then opens the socket and attaches', async () => {
    const { controller, sent } = makeController();
    controller._episodeId = '1';
    const warmed = [];
    let socketCalls = 0;
    controller._fetchWarmSession = (id) => { warmed.push(id); };
    controller._ensureSocket = async () => { socketCalls += 1; };

    await controller.warmSession();
    await controller.warmSession();

    expect(warmed).to.deep.equal(['1']);
    expect(socketCalls).to.equal(1);
    expect(sent).to.deep.equal([{ type: 'ATTACH' }]);
  });

  it('is a no-op when there is no active episode', async () => {
    const { controller } = makeController();
    const warmed = [];
    controller._fetchWarmSession = (id) => { warmed.push(id); };

    await controller.warmSession();

    expect(warmed).to.have.length(0);
  });

  it('is a no-op while a turn is already in flight', async () => {
    const { controller } = makeController();
    controller._episodeId = '1';
    controller._thinking = true;
    const warmed = [];
    controller._fetchWarmSession = (id) => { warmed.push(id); };

    await controller.warmSession();

    expect(warmed).to.have.length(0);
  });

  it('warms again after switching to a different episode', async () => {
    const { controller } = makeController();
    controller._episodeId = '1';
    const warmed = [];
    controller._fetchWarmSession = (id) => { warmed.push(id); };

    await controller.warmSession();
    controller._episodeId = '2';
    await controller.warmSession();

    expect(warmed).to.deep.equal(['1', '2']);
  });

  it('swallows a failed connection attempt — sendMessage retries normally later', async () => {
    const { controller } = makeController();
    controller._episodeId = '1';
    controller._fetchWarmSession = async () => {};
    controller._ensureSocket = async () => { throw new Error('AO WebSocket error'); };

    await controller.warmSession(); // rejecting would fail this test
  });
});

describe('ao-controller socket coalescing', () => {
  it('_ensureSocket shares one in-flight connection attempt across concurrent callers', async () => {
    const { controller } = makeController();
    delete controller._ensureSocket; // use the real implementation, not makeController's stub
    let connectCalls = 0;
    let resolveConnect;
    controller._connect = () => {
      connectCalls += 1;
      return new Promise((resolve) => { resolveConnect = resolve; });
    };

    const first = controller._ensureSocket();
    const second = controller._ensureSocket();
    resolveConnect();
    await Promise.all([first, second]);

    expect(connectCalls).to.equal(1);
  });

  it('a later call reconnects once the in-flight attempt has settled', async () => {
    const { controller } = makeController();
    delete controller._ensureSocket;
    let connectCalls = 0;
    controller._connect = async () => { connectCalls += 1; };

    await controller._ensureSocket();
    await controller._ensureSocket();

    expect(connectCalls).to.equal(2);
  });
});
