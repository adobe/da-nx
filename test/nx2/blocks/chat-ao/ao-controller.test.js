import { expect } from '@esm-bundle/chai';
import AoChatController from '../../../../nx2/blocks/chat-ao/ao-controller.js';

const APPLICATION = {
  id: 'da.live',
  name: 'Experience Workspace',
  description: 'Experience Workspace, built on da.live: an intelligent authoring surface '
    + 'where humans and AI agents collaborate to build, edit, and optimize digital experiences.',
};

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

    const { clientMessageId } = controller._messages[0];
    expect(clientMessageId).to.be.a('string').with.length.above(0);
    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'hello AO', clientMessageId }]);
    expect(updates[0].thinking).to.equal(true);
    expect(sent).to.deep.equal([
      {
        type: 'USER_INPUT',
        text: 'hello AO',
        clientMessageId,
        client_context: { application: APPLICATION },
      },
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
      {
        type: 'USER_INPUT',
        text: 'looks good, go ahead',
        clientMessageId: sent[0].clientMessageId,
        client_context: { application: APPLICATION },
      },
    ]);
    expect(sent[0].clientMessageId).to.be.a('string').with.length.above(0);
  });

  it('carries selected context items as focused_resources, not the shown message', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('what does this do?', [
      { type: 'block', blockName: 'hero', id: 'a' },
      { type: 'text', innerHTML: '<p>hello <b>world</b></p>', id: 'b' },
    ]);

    expect(controller._messages).to.deep.equal([{
      role: 'user',
      content: 'what does this do?',
      clientMessageId: controller._messages[0].clientMessageId,
      selectionContext: [
        { type: 'block', blockName: 'hero' },
        { type: 'text', innerHTML: '<p>hello <b>world</b></p>' },
      ],
    }]);
    expect(sent[0].text).to.equal('what does this do?');
    expect(sent[0].client_context.focused_resources).to.deep.equal([
      { type: 'block', id: 'a', name: 'hero' },
      { type: 'text-selection', name: 'hello world' },
    ]);
  });

  it('carries the current document as a focused resource, with org/site spelled out rather than embedded in id', async () => {
    const { controller, sent } = makeController();
    controller.setContext({ org: 'adobe', site: 'da-live', path: '/docs/foo' });

    await controller.sendMessage('what does this do?');

    expect(sent[0].text).to.equal('what does this do?');
    expect(sent[0].client_context).to.deep.equal({
      application: APPLICATION,
      focused_resources: [{
        type: 'document',
        id: 'adobe/da-live/docs/foo',
        name: '/docs/foo',
        description: 'Organization: adobe, Site: da-live',
      }],
    });
  });

  it('normalizes the id separator when path has no leading slash', async () => {
    const { controller, sent } = makeController();
    controller.setContext({ org: 'adobe', site: 'da-live', path: 'docs/foo' });

    await controller.sendMessage('what does this do?');

    expect(sent[0].client_context.focused_resources[0].id).to.equal('adobe/da-live/docs/foo');
  });

  it('still sends the da.live application, but no focused_resources, when no context has been set and nothing is selected', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('hello AO');

    expect(sent[0].text).to.equal('hello AO');
    expect(sent[0].client_context).to.deep.equal({ application: APPLICATION });
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

describe('ao-controller cross-client user messages', () => {
  it('appends a message sent from another client attached to the same episode', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent({
      type: 'user_message',
      data: { text: 'update the headline', client_message_id: 'from-coworker-ui' },
    });

    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'update the headline' }]);
    expect(updates).to.have.length(1);
  });

  it('skips its own echo — a user_message whose clientMessageId matches one already rendered locally', async () => {
    const { controller, updates } = makeController();
    await controller.sendMessage('hello AO');
    const { clientMessageId } = controller._messages[0];
    const updateCountAfterSend = updates.length;

    controller._handleServerEvent({
      type: 'user_message',
      data: { text: 'hello AO', client_message_id: clientMessageId },
    });

    expect(controller._messages).to.have.length(1); // not duplicated
    expect(updates).to.have.length(updateCountAfterSend); // no extra update for the no-op
  });

  it('still appends when client_message_id is missing, rather than risking a false-positive dedup match', () => {
    const { controller } = makeController();

    controller._handleServerEvent({
      type: 'user_message',
      data: { text: 'no id on this one' },
    });

    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'no id on this one' }]);
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

describe('ao-controller ui artifacts', () => {
  it('appends a uiArtifact message on UI_ARTIFACT_CREATED', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent({
      type: 'ui_artifact_created',
      data: {
        artifact: {
          id: 'artifact-1',
          a2ui_surface: { components: [{ type: 'Markdown', props: { content: 'hi' } }] },
          text_fallback: 'hi',
          display_hints: { title: 'Summary' },
        },
      },
    });

    expect(controller._messages).to.deep.equal([{
      role: 'assistant',
      uiArtifact: {
        id: 'artifact-1',
        components: [{ type: 'Markdown', props: { content: 'hi' } }],
        textFallback: 'hi',
        title: 'Summary',
      },
    }]);
    expect(updates).to.have.length(1);
  });

  it('is a no-op when the event carries no artifact', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent({ type: 'ui_artifact_created', data: {} });

    expect(controller._messages).to.deep.equal([]);
    expect(updates).to.have.length(0);
  });
});

describe('ao-controller tool-call activity', () => {
  it('appends a detected toolCall message on tool_call_detected, with no arguments yet', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent({
      type: 'tool_call_detected',
      data: { tool_call_id: 'tc1', tool_name: 'search_content' },
    });

    expect(controller._messages).to.deep.equal([{
      role: 'assistant',
      toolCall: { toolCallId: 'tc1', toolName: 'search_content', status: 'detected' },
    }]);
    expect(updates).to.have.length(1);
  });

  it('upgrades a detected toolCall to running on tool_call_start, patching in place rather than appending', () => {
    const { controller, updates } = makeController();
    controller._handleServerEvent({
      type: 'tool_call_detected',
      data: { tool_call_id: 'tc1', tool_name: 'search_content' },
    });

    controller._handleServerEvent({
      type: 'tool_call_start',
      data: { tool_call_id: 'tc1', tool_name: 'search_content', arguments: { query: 'hero' } },
    });

    expect(controller._messages).to.deep.equal([{
      role: 'assistant',
      toolCall: {
        toolCallId: 'tc1', toolName: 'search_content', status: 'running', arguments: { query: 'hero' },
      },
    }]);
    expect(updates).to.have.length(2);
  });

  it('appends a running toolCall message on tool_call_start', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent({
      type: 'tool_call_start',
      data: { tool_call_id: 'tc1', tool_name: 'search_content', arguments: { query: 'hero' } },
    });

    expect(controller._messages).to.deep.equal([{
      role: 'assistant',
      toolCall: {
        toolCallId: 'tc1', toolName: 'search_content', status: 'running', arguments: { query: 'hero' },
      },
    }]);
    expect(updates).to.have.length(1);
  });

  it('patches the same toolCall entry in place on tool_call_end, rather than appending a second row', () => {
    const { controller, updates } = makeController();
    controller._handleServerEvent({
      type: 'tool_call_start',
      data: { tool_call_id: 'tc1', tool_name: 'search_content', arguments: { query: 'hero' } },
    });

    controller._handleServerEvent({
      type: 'tool_call_end',
      data: { tool_call_id: 'tc1', result: { matches: 3 }, success: true, duration_s: 1.2 },
    });

    expect(controller._messages).to.deep.equal([{
      role: 'assistant',
      toolCall: {
        toolCallId: 'tc1',
        toolName: 'search_content',
        status: 'success',
        arguments: { query: 'hero' },
        result: { matches: 3 },
        durationS: 1.2,
      },
    }]);
    expect(updates).to.have.length(2);
  });

  it('marks the toolCall as failed when tool_call_end reports success: false', () => {
    const { controller } = makeController();
    controller._handleServerEvent({
      type: 'tool_call_start',
      data: { tool_call_id: 'tc1', tool_name: 'search_content', arguments: {} },
    });

    controller._handleServerEvent({
      type: 'tool_call_end',
      data: { tool_call_id: 'tc1', result: null, success: false },
    });

    expect(controller._messages[0].toolCall.status).to.equal('error');
  });

  it('leaves other messages untouched when patching a toolCall by id', () => {
    const { controller } = makeController();
    controller._handleServerEvent({
      type: 'tool_call_start',
      data: { tool_call_id: 'tc1', tool_name: 'search_content', arguments: {} },
    });
    controller._handleServerEvent({
      type: 'tool_call_start',
      data: { tool_call_id: 'tc2', tool_name: 'read_file', arguments: {} },
    });

    controller._handleServerEvent({
      type: 'tool_call_end',
      data: { tool_call_id: 'tc1', result: 'done', success: true },
    });

    expect(controller._messages[1].toolCall).to.deep.equal({
      toolCallId: 'tc2', toolName: 'read_file', status: 'running', arguments: {},
    });
  });

  it('surfaces metadata.skill_title as a friendly title on tool_call_start, e.g. for a skill tool call', () => {
    const { controller } = makeController();

    controller._handleServerEvent({
      type: 'tool_call_start',
      data: {
        tool_call_id: 'tc1',
        tool_name: 'skill',
        arguments: { skill_name: 'aem-sites-da-page-update' },
        metadata: { skill_name: 'aem-sites-da-page-update', skill_title: 'AEM Sites DA Page Update' },
      },
    });

    expect(controller._messages[0].toolCall.title).to.equal('AEM Sites DA Page Update');
  });

  it('carries the title through to tool_call_end without needing it repeated', () => {
    const { controller } = makeController();
    controller._handleServerEvent({
      type: 'tool_call_start',
      data: {
        tool_call_id: 'tc1',
        tool_name: 'skill',
        arguments: {},
        metadata: { skill_title: 'AEM Sites DA Page Update' },
      },
    });

    controller._handleServerEvent({
      type: 'tool_call_end',
      data: { tool_call_id: 'tc1', result: 'a long skill body...', success: true, duration_s: 0.03 },
    });

    expect(controller._messages[0].toolCall.title).to.equal('AEM Sites DA Page Update');
  });

  it('picks up the title from tool_call_end when tool_call_start had none', () => {
    const { controller } = makeController();
    controller._handleServerEvent({
      type: 'tool_call_start',
      data: { tool_call_id: 'tc1', tool_name: 'skill', arguments: {} },
    });

    controller._handleServerEvent({
      type: 'tool_call_end',
      data: {
        tool_call_id: 'tc1', result: 'done', success: true, metadata: { skill_title: 'Late Title' },
      },
    });

    expect(controller._messages[0].toolCall.title).to.equal('Late Title');
  });

  it('omits title entirely for tool calls with no skill metadata', () => {
    const { controller } = makeController();
    controller._handleServerEvent({
      type: 'tool_call_start',
      data: { tool_call_id: 'tc1', tool_name: 'search_content', arguments: {} },
    });

    expect(controller._messages[0].toolCall).to.not.have.property('title');
  });
});

describe('ao-controller hydrateToolCall', () => {
  function makeControllerWithSummary(toolCall) {
    const { controller, updates } = makeController();
    controller._messages = [{ role: 'assistant', toolCall }];
    return { controller, updates };
  }

  it('nests the real tool call inside the same summary row, keeping its position and identity', async () => {
    const { controller, updates } = makeControllerWithSummary({
      toolCallId: 't1:summary', status: 'summary', summaryText: 'Used 1 tool', turnId: 't1',
    });
    let requestedTurnId;
    controller._fetchTurnEvents = async (turnId) => {
      requestedTurnId = turnId;
      return [
        { type: 'assistant_message', tool_calls: [{ id: 'real-tc1', name: 'skill', arguments: '{}' }] },
        {
          type: 'tool_result',
          tool_call_id: 'real-tc1',
          result: 'full body',
          status: 'success',
          duration_s: 0.05,
          metadata: { skill_title: 'AEM Sites DA Page Update' },
        },
      ];
    };

    await controller.hydrateToolCall('t1:summary');

    expect(requestedTurnId).to.equal('t1');
    expect(controller._messages).to.have.length(1);
    expect(controller._messages[0].toolCall).to.deep.equal({
      toolCallId: 't1:summary', // kept stable so the <details> element identity/open-state survives
      status: 'summary',
      summaryText: 'Used 1 tool', // unchanged — swapping this out mid-expand read as broken
      turnId: 't1',
      calls: [{
        toolCallId: 'real-tc1',
        toolName: 'skill',
        arguments: {},
        result: 'full body',
        status: 'success',
        durationS: 0.05,
        title: 'AEM Sites DA Page Update',
      }],
    });
    expect(updates).to.have.length(2); // loadingCalls: true, then the hydrated result
  });

  it('marks loadingCalls true synchronously, and clears it once the fetch resolves', async () => {
    const { controller, updates } = makeControllerWithSummary({
      toolCallId: 't1:summary', status: 'summary', summaryText: 'Used 1 tool', turnId: 't1',
    });
    let resolveFetch;
    controller._fetchTurnEvents = () => new Promise((resolve) => { resolveFetch = resolve; });

    const pending = controller.hydrateToolCall('t1:summary');
    expect(controller._messages[0].toolCall.loadingCalls).to.equal(true);
    expect(updates).to.have.length(1);

    resolveFetch([
      { type: 'assistant_message', tool_calls: [{ id: 'tc1', name: 'skill', arguments: '{}' }] },
      { type: 'tool_result', tool_call_id: 'tc1', result: 'r', status: 'success' },
    ]);
    await pending;

    expect(controller._messages[0].toolCall).to.not.have.property('loadingCalls');
    expect(updates).to.have.length(2);
  });

  it('leaves summaryText untouched once multiple calls are hydrated', async () => {
    const { controller } = makeControllerWithSummary({
      toolCallId: 't1:summary', status: 'summary', summaryText: 'Used 2 tools', turnId: 't1',
    });
    controller._fetchTurnEvents = async () => [
      {
        type: 'assistant_message',
        tool_calls: [{ id: 'tc1', name: 'read_file', arguments: '{}' }, { id: 'tc2', name: 'skill', arguments: '{}' }],
      },
      { type: 'tool_result', tool_call_id: 'tc1', result: 'a-result', status: 'success' },
      { type: 'tool_result', tool_call_id: 'tc2', result: 'b-result', status: 'success' },
    ];

    await controller.hydrateToolCall('t1:summary');

    expect(controller._messages[0].toolCall.summaryText).to.equal('Used 2 tools');
    expect(controller._messages[0].toolCall.calls.map((c) => c.toolCallId)).to.deep.equal(['tc1', 'tc2']);
  });

  it('leaves sibling messages untouched when hydrating one summary row', async () => {
    const { controller } = makeController();
    controller._messages = [
      { role: 'assistant', content: 'before' },
      {
        role: 'assistant',
        toolCall: { toolCallId: 't1:summary', status: 'summary', summaryText: 'Used 1 tool', turnId: 't1' },
      },
      { role: 'assistant', content: 'after' },
    ];
    controller._fetchTurnEvents = async () => [
      { type: 'assistant_message', tool_calls: [{ id: 'tc1', name: 'skill', arguments: '{}' }] },
      { type: 'tool_result', tool_call_id: 'tc1', result: 'a-result', status: 'success' },
    ];

    await controller.hydrateToolCall('t1:summary');

    expect(controller._messages).to.have.length(3);
    expect(controller._messages[0].content).to.equal('before');
    expect(controller._messages[2].content).to.equal('after');
    expect(controller._messages[1].toolCall.calls).to.have.length(1);
  });

  it('is a no-op for a toolCallId that is not pending hydration (already hydrated or unknown)', async () => {
    const { controller, updates } = makeControllerWithSummary({
      toolCallId: 't1:summary', toolName: 'skill', status: 'success', result: 'already hydrated',
    });
    let called = false;
    controller._fetchTurnEvents = async () => {
      called = true;
      return [];
    };

    await controller.hydrateToolCall('t1:summary');
    await controller.hydrateToolCall('does-not-exist');

    expect(called).to.equal(false);
    expect(updates).to.have.length(0);
    expect(controller._messages[0].toolCall.result).to.equal('already hydrated');
  });

  it('still clears loadingCalls (leaving `calls` unset) when the turn\'s events yield no tool calls', async () => {
    const { controller, updates } = makeControllerWithSummary({
      toolCallId: 't1:summary', status: 'summary', summaryText: 'Used 1 tool', turnId: 't1',
    });
    controller._fetchTurnEvents = async () => [];

    await controller.hydrateToolCall('t1:summary');

    expect(controller._messages[0].toolCall.status).to.equal('summary');
    expect(controller._messages[0].toolCall).to.not.have.property('calls');
    expect(controller._messages[0].toolCall).to.not.have.property('loadingCalls');
    expect(updates).to.have.length(2); // loadingCalls: true, then cleared
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

  it('_loadEpisode also attaches for live listening, not just once the user starts typing', async () => {
    const { controller } = makeController();
    const warmed = [];
    controller.warmSession = async () => { warmed.push(controller._episodeId); };
    controller._fetchEpisodeMessages = async () => [];

    await controller._loadEpisode('1');

    expect(warmed).to.deep.equal(['1']);
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

  it('does not wipe a known episode list when the refresh fetch itself fails (returns [])', async () => {
    const { controller, updates } = makeController();
    controller._episodes = [{ id: '1', title: 'Existing episode' }];
    controller._fetchEpisodes = async () => []; // e.g. a transient network/auth failure

    controller._handleServerEvent({ type: 'SESSION_READY', episode_id: '2' });
    await Promise.resolve();

    expect(controller._episodes).to.deep.equal([{ id: '1', title: 'Existing episode' }]);
    expect(updates).to.have.length(0);
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

  it('inserts a new entry at the front when the episode isn\'t in the list yet, rather than dropping the title', () => {
    const { controller, updates } = makeController();
    controller._episodes = [{ id: '1', title: 'Existing episode' }];

    controller._handleServerEvent({
      type: 'episode_title_updated',
      data: { episode_id: 'brand-new', title: 'Generated title' },
    });

    expect(updates.at(-1).episodes).to.deep.equal([
      { id: 'brand-new', title: 'Generated title' },
      { id: '1', title: 'Existing episode' },
    ]);
  });

  it('is a genuine no-op when the episode is unknown and there is no title to insert', () => {
    const { controller, updates } = makeController();
    controller._episodes = [{ id: '1', title: null }];

    controller._handleServerEvent({
      type: 'episode_title_updated',
      data: { episode_id: 'unknown-id', title: null },
    });

    expect(controller._episodes).to.deep.equal([{ id: '1', title: null }]);
    expect(updates).to.have.length(0);
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

describe('ao-controller connection recovery', () => {
  it('reattaches on a dropped socket rather than declaring the turn dead', async () => {
    const { controller, sent, updates } = makeController();
    controller._episodeId = '1';
    controller._thinking = true;
    controller._messages = [{ role: 'user', content: 'update the headline' }];

    await controller._recoverFromClose();

    expect(sent).to.deep.equal([{ type: 'ATTACH' }]);
    // Still waiting on the turn's remaining events — not declared dead.
    expect(controller._thinking).to.equal(true);
    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'update the headline' }]);
    expect(updates).to.have.length(0);
  });

  it('surfaces an error and ends the turn only when reattaching itself fails mid-turn', async () => {
    const { controller, updates } = makeController();
    controller._episodeId = '1';
    controller._thinking = true;
    controller._ensureSocket = async () => { throw new Error('AO WebSocket error'); };

    await controller._recoverFromClose();

    expect(controller._messages.at(-1)).to.deep.equal({
      role: 'assistant', content: 'Error: AO WebSocket error',
    });
    expect(controller._thinking).to.equal(false);
    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('reattaches even while idle (not mid-turn), so cross-client updates keep arriving live', async () => {
    const { controller, sent, updates } = makeController();
    controller._episodeId = '1';
    controller._thinking = false;

    await controller._recoverFromClose();

    expect(sent).to.deep.equal([{ type: 'ATTACH' }]);
    expect(updates).to.have.length(0);
  });

  it('fails silently when idle — a background reconnect failure should not interrupt the user', async () => {
    const { controller } = makeController();
    controller._episodeId = '1';
    controller._thinking = false;
    controller._ensureSocket = async () => { throw new Error('AO WebSocket error'); };

    await controller._recoverFromClose(); // throwing would fail this test

    expect(controller._messages).to.deep.equal([]);
  });

  it('is a no-op when there is no active episode to reattach to', async () => {
    const { controller, sent, updates } = makeController();

    await controller._recoverFromClose();

    expect(sent).to.have.length(0);
    expect(updates).to.have.length(0);
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
