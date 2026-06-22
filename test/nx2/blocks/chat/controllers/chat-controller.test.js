import { expect } from '@esm-bundle/chai';
import ChatController from '../../../../../nx2/blocks/chat/controllers/chat-controller.js';
import { TOOL_STATE, AGENT_EVENT, ROLE, FINISH_REASON } from '../../../../../nx2/blocks/chat/constants.js';

function makeController() {
  return new ChatController({ onUpdate() { }, onToolDone() { } });
}

describe('ChatController — _onApprovalRequest', () => {
  it('does nothing when card is already in a settled state', () => {
    const ctrl = makeController();
    ctrl._turn.begin();
    const settled = [
      TOOL_STATE.APPROVAL_REQUESTED, TOOL_STATE.APPROVED,
      TOOL_STATE.REJECTED, TOOL_STATE.DONE, TOOL_STATE.ERROR,
    ];
    for (const state of settled) {
      ctrl._messages = [{ role: ROLE.USER, content: 'go' }];
      ctrl._toolCards = new Map([['tc-1', { toolName: 'my-tool', input: {}, state }]]);
      ctrl._pendingBatch = { toolCalls: [], approvalRequests: [] };
      ctrl._onApprovalRequest('tc-1', 'my-tool', 'ap-1');
      expect(ctrl._pendingBatch.approvalRequests).to.have.lengthOf(0);
      expect(ctrl._messages).to.have.lengthOf(1); // no message committed
    }
  });

  it('commits assistant message and updates card to APPROVAL_REQUESTED for manual approval', () => {
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._messages = [{ role: ROLE.USER, content: 'go' }];
    ctrl._pendingBatch = {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'my-tool', input: { path: '/a.md' } }],
      approvalRequests: [],
    };
    ctrl._toolCards = new Map([['tc-1', { toolName: 'my-tool', input: { path: '/a.md' }, state: TOOL_STATE.RUNNING }]]);

    ctrl._onApprovalRequest('tc-1', 'my-tool', 'ap-1');

    expect(ctrl._toolCards.get('tc-1').state).to.equal(TOOL_STATE.APPROVAL_REQUESTED);
    expect(ctrl._toolCards.get('tc-1').approvalId).to.equal('ap-1');
    expect(ctrl._pendingBatch.approvalRequests).to.deep.equal([{ approvalId: 'ap-1', toolCallId: 'tc-1' }]);
    // tool-call removed from batch (already committed in the message)
    expect(ctrl._pendingBatch.toolCalls).to.have.lengthOf(0);
    expect(ctrl._turn.isActive).to.be.true;

    // Assistant message committed immediately
    expect(ctrl._messages).to.have.lengthOf(2);
    expect(ctrl._messages[1]).to.deep.equal({
      role: ROLE.ASSISTANT,
      content: [
        { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'my-tool', input: { path: '/a.md' } },
        { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
      ],
    });
  });

  it('merges a preceding text-only assistant message into the approval message', () => {
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      { role: ROLE.ASSISTANT, content: 'Sure, creating those pages now.' },
    ];
    ctrl._pendingBatch = {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'content_create', input: { path: '/a.md' } }],
      approvalRequests: [],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'content_create', input: { path: '/a.md' }, state: TOOL_STATE.RUNNING }],
    ]);

    ctrl._onApprovalRequest('tc-1', 'content_create', 'ap-1');

    // Text merged in — only 2 messages total, not 3
    expect(ctrl._messages).to.have.lengthOf(2);
    expect(ctrl._messages[1]).to.deep.equal({
      role: ROLE.ASSISTANT,
      content: [
        { type: 'text', text: 'Sure, creating those pages now.' },
        { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'content_create', input: { path: '/a.md' } },
        { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
      ],
    });
  });

  it('sets card to APPROVED and commits message when tool name is in autoApprovedTools', () => {
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._autoApprovedTools = new Set(['my-tool']);
    ctrl._messages = [{ role: ROLE.USER, content: 'go' }];
    ctrl._pendingBatch = {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'my-tool', input: {} }],
      approvalRequests: [],
    };
    ctrl._toolCards = new Map([['tc-1', { toolName: 'my-tool', input: {}, state: TOOL_STATE.RUNNING }]]);

    ctrl._onApprovalRequest('tc-1', 'my-tool', 'ap-1');

    expect(ctrl._toolCards.get('tc-1').state).to.equal(TOOL_STATE.APPROVED);
    expect(ctrl._pendingBatch.approvalRequests).to.deep.equal([{ approvalId: 'ap-1', toolCallId: 'tc-1' }]);
    // Message still committed immediately even for auto-approved
    expect(ctrl._messages).to.have.lengthOf(2);
    expect(ctrl._messages[1].content[1].type).to.equal(AGENT_EVENT.TOOL_APPROVAL_REQUEST);
  });

  it('each parallel approval tool gets its own assistant message (no batching)', () => {
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._messages = [{ role: ROLE.USER, content: 'go' }];
    ctrl._pendingBatch = {
      toolCalls: [
        { toolCallId: 'tc-1', toolName: 'tool-a', input: { a: 1 } },
        { toolCallId: 'tc-2', toolName: 'tool-b', input: { b: 2 } },
      ],
      approvalRequests: [],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'tool-a', input: { a: 1 }, state: TOOL_STATE.RUNNING }],
      ['tc-2', { toolName: 'tool-b', input: { b: 2 }, state: TOOL_STATE.RUNNING }],
    ]);

    ctrl._onApprovalRequest('tc-1', 'tool-a', 'ap-1');
    ctrl._onApprovalRequest('tc-2', 'tool-b', 'ap-2');

    // Two separate approval messages
    expect(ctrl._messages).to.have.lengthOf(3);
    expect(ctrl._messages[1].content).to.deep.equal([
      { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'tool-a', input: { a: 1 } },
      { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
    ]);
    expect(ctrl._messages[2].content).to.deep.equal([
      { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-2', toolName: 'tool-b', input: { b: 2 } },
      { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-2', toolCallId: 'tc-2' },
    ]);
    expect(ctrl._pendingBatch.toolCalls).to.have.lengthOf(0);
  });
});

describe('ChatController — _onStreamFinish', () => {
  it('does not modify messages or set continuation when batch is empty (text-only response)', () => {
    const ctrl = makeController();
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    ctrl._messages = [...messages];

    ctrl._onStreamFinish('room-1');

    expect(ctrl._messages).to.deep.equal(messages);
    expect(ctrl._pendingContinuation).to.be.undefined;
  });

  it('adds auto-approval responses and sets continuation when all cards are approved', () => {
    const ctrl = makeController();
    // Approval messages were already committed by _onApprovalRequest
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      {
        role: ROLE.ASSISTANT,
        content: [
          { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'my-tool', input: { x: 1 } },
          { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
        ],
      },
    ];
    ctrl._pendingBatch = {
      toolCalls: [],
      approvalRequests: [{ approvalId: 'ap-1', toolCallId: 'tc-1' }],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: { x: 1 }, state: TOOL_STATE.APPROVED, approvalId: 'ap-1' }],
    ]);

    ctrl._onStreamFinish('room-1');

    // Auto-approval response appended after the already-committed assistant message
    expect(ctrl._messages).to.have.lengthOf(3);
    expect(ctrl._messages[2]).to.deep.equal({
      role: ROLE.TOOL,
      content: [{ type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId: 'ap-1', approved: true }],
    });
    expect(ctrl._pendingContinuation).to.be.true;
    expect(ctrl._pendingBatch.approvalRequests).to.have.lengthOf(0);
  });

  it('does not set continuation when approval is pending (manual) — just clears the batch', () => {
    const ctrl = makeController();
    // Approval message was already committed by _onApprovalRequest
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      {
        role: ROLE.ASSISTANT,
        content: [
          { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'my-tool', input: {} },
          { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
        ],
      },
    ];
    ctrl._pendingBatch = {
      toolCalls: [],
      approvalRequests: [{ approvalId: 'ap-1', toolCallId: 'tc-1' }],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVAL_REQUESTED, approvalId: 'ap-1' }],
    ]);

    ctrl._onStreamFinish('room-1');

    expect(ctrl._messages).to.have.lengthOf(2); // no new messages added
    expect(ctrl._pendingContinuation).to.not.be.true;
    expect(ctrl._pendingBatch.approvalRequests).to.have.lengthOf(0);
  });

  it('adds responses for all parallel auto-approved tools', () => {
    const ctrl = makeController();
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      {
        role: ROLE.ASSISTANT,
        content: [
          { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'tool-a', input: {} },
          { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
        ],
      },
      {
        role: ROLE.ASSISTANT,
        content: [
          { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-2', toolName: 'tool-b', input: {} },
          { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-2', toolCallId: 'tc-2' },
        ],
      },
    ];
    ctrl._pendingBatch = {
      toolCalls: [],
      approvalRequests: [
        { approvalId: 'ap-1', toolCallId: 'tc-1' },
        { approvalId: 'ap-2', toolCallId: 'tc-2' },
      ],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'tool-a', input: {}, state: TOOL_STATE.APPROVED, approvalId: 'ap-1' }],
      ['tc-2', { toolName: 'tool-b', input: {}, state: TOOL_STATE.APPROVED, approvalId: 'ap-2' }],
    ]);

    ctrl._onStreamFinish('room-1');

    expect(ctrl._messages[3].content[0].approvalId).to.equal('ap-1');
    expect(ctrl._messages[4].content[0].approvalId).to.equal('ap-2');
    expect(ctrl._messages).to.have.lengthOf(5);
    expect(ctrl._pendingContinuation).to.be.true;
  });

  it('skips duplicate responses and does not set continuation when user approved before stream ended (race condition)', () => {
    // Scenario: user clicked "approve" before FINISH_MESSAGE arrived, so approveToolCall
    // already added the tool-approval-response. _onStreamFinish must not add it again and
    // must not set _pendingContinuation (approveToolCall's stream is already in flight).
    const ctrl = makeController();
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      {
        role: ROLE.ASSISTANT,
        content: [
          { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'my-tool', input: {} },
          { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
        ],
      },
      // approveToolCall already added this response
      { role: ROLE.TOOL, content: [{ type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId: 'ap-1', approved: true }] },
    ];
    ctrl._pendingBatch = {
      toolCalls: [],
      approvalRequests: [{ approvalId: 'ap-1', toolCallId: 'tc-1' }],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVED, approvalId: 'ap-1' }],
    ]);

    ctrl._onStreamFinish('room-1');

    expect(ctrl._messages).to.have.lengthOf(3); // no duplicate added
    expect(ctrl._pendingContinuation).to.not.be.true; // no spurious Stream C
    expect(ctrl._pendingBatch.approvalRequests).to.have.lengthOf(0); // batch still cleared
  });
});

describe('ChatController — approveToolCall', () => {
  function makeControllerWithCard(state = TOOL_STATE.APPROVAL_REQUESTED) {
    const ctrl = makeController();
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      {
        role: ROLE.ASSISTANT,
        content: [
          { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'my-tool', input: {} },
          { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
        ],
      },
    ];
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: {}, state, approvalId: 'ap-1' }],
    ]);
    ctrl._turn.begin();
    ctrl._turn.pause();
    return ctrl;
  }

  it('does nothing when the card has no approvalId', async () => {
    const ctrl = makeController();
    ctrl._messages = [{ role: ROLE.USER, content: 'go' }];
    ctrl._toolCards = new Map([['tc-1', { toolName: 'my-tool', state: TOOL_STATE.APPROVAL_REQUESTED }]]);
    await ctrl.approveToolCall('tc-1', true);
    expect(ctrl._messages).to.have.lengthOf(1);
  });

  it('appends an approval response and calls stream', async () => {
    const ctrl = makeControllerWithCard();
    let streamCalled = false;
    ctrl._stream = () => {
      streamCalled = true;
      return Promise.resolve();
    };

    await ctrl.approveToolCall('tc-1', true);

    // Approval response is committed; mock stream returns no tool-result so the justApproved
    // close-out adds a synthetic tool-result — the response is not the last message.
    const response = ctrl._messages
      .filter((m) => m.role === ROLE.TOOL)
      .flatMap((m) => m.content)
      .find((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_RESPONSE);
    expect(response).to.deep.equal({ type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId: 'ap-1', approved: true });
    expect(streamCalled).to.be.true;
    expect(ctrl._turn.isActive).to.be.false;
  });

  it('bulk-approves siblings with the same tool name when always=true', async () => {
    const ctrl = makeControllerWithCard();
    ctrl._toolCards.set('tc-2', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVAL_REQUESTED, approvalId: 'ap-2' });
    ctrl._toolCards.set('tc-3', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVAL_REQUESTED, approvalId: 'ap-3' });
    ctrl._stream = () => Promise.resolve();

    await ctrl.approveToolCall('tc-1', true, true);

    // All three responses committed in one go
    const responses = ctrl._messages
      .filter((m) => m.role === ROLE.TOOL)
      .flatMap((m) => m.content)
      .filter((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_RESPONSE);

    expect(responses).to.have.lengthOf(3);
    expect(responses.map((r) => r.approvalId)).to.include.members(['ap-1', 'ap-2', 'ap-3']);
    // Mock stream returns no tool-results → justApproved close-out sets all to DONE.
    expect(ctrl._toolCards.get('tc-2').state).to.equal(TOOL_STATE.DONE);
    expect(ctrl._toolCards.get('tc-3').state).to.equal(TOOL_STATE.DONE);
  });

  it('appends a rejection response and calls stream', async () => {
    const ctrl = makeControllerWithCard();
    let streamCalled = false;
    ctrl._stream = () => {
      streamCalled = true;
      return Promise.resolve();
    };

    await ctrl.approveToolCall('tc-1', false);

    expect(ctrl._messages.at(-1)).to.deep.equal({
      role: ROLE.TOOL,
      content: [{ type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId: 'ap-1', approved: false }],
    });
    // Rejection streams immediately so da-agent can respond (e.g. "I won't do that").
    expect(streamCalled).to.be.true;
    expect(ctrl._turn.isActive).to.be.false;
  });

  it('streams immediately for the first approval even when siblings are still pending', async () => {
    // Per-tool streaming: each approval fires its own _stream() right away so da-agent
    // can use buildApprovalContinuationResponse while other tools still have unresolved
    // tool-approval-request parts — this keeps hasPendingApprovals=true and ensures
    // results are streamed back rather than absorbed internally by streamText.
    const ctrl = makeControllerWithCard();
    ctrl._toolCards.set('tc-2', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVAL_REQUESTED, approvalId: 'ap-2' });
    ctrl._toolCards.set('tc-3', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVAL_REQUESTED, approvalId: 'ap-3' });
    let streamCount = 0;
    ctrl._stream = async () => { streamCount += 1; };

    await ctrl.approveToolCall('tc-1', true);

    // Stream fired immediately for tc-1, not deferred until tc-2/tc-3 are resolved.
    expect(streamCount).to.equal(1);
    // Response for tc-1 is committed.
    const responses = ctrl._messages
      .filter((m) => m.role === ROLE.TOOL)
      .flatMap((m) => m.content)
      .filter((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_RESPONSE);
    expect(responses).to.have.lengthOf(1);
    expect(responses[0].approvalId).to.equal('ap-1');
  });
});

describe('ChatController — _onToolResult', () => {
  it('commits call+result pair and removes tool from batch (non-approval)', () => {
    const ctrl = makeController();
    ctrl._messages = [{ role: ROLE.USER, content: 'go' }];
    ctrl._pendingBatch = {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'my-tool', input: { path: '/a.md' } }],
      approvalRequests: [],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: { path: '/a.md' }, state: TOOL_STATE.RUNNING }],
    ]);

    ctrl._onToolResult('tc-1', 'my-tool', 'done', false, null);

    expect(ctrl._messages).to.have.lengthOf(3);
    expect(ctrl._messages[1]).to.deep.equal({
      role: ROLE.ASSISTANT,
      content: [{ type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'my-tool', input: { path: '/a.md' } }],
    });
    expect(ctrl._messages[2]).to.deep.equal({
      role: ROLE.TOOL,
      content: [{ type: AGENT_EVENT.TOOL_RESULT, toolCallId: 'tc-1', toolName: 'my-tool', output: { type: 'text', value: 'done' } }],
    });
    expect(ctrl._pendingBatch.toolCalls).to.have.lengthOf(0);
  });

  it('commits result only in continuation stream (approval tool, not in batch)', () => {
    const ctrl = makeController();
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      {
        role: ROLE.ASSISTANT,
        content: [
          { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'my-tool', input: {} },
          { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId: 'ap-1', toolCallId: 'tc-1' },
        ],
      },
      { role: ROLE.TOOL, content: [{ type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId: 'ap-1', approved: true }] },
    ];
    ctrl._pendingBatch = { toolCalls: [], approvalRequests: [] };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVED, approvalId: 'ap-1' }],
    ]);

    ctrl._onToolResult('tc-1', 'my-tool', 'done', false, null);

    expect(ctrl._messages).to.have.lengthOf(4);
    expect(ctrl._messages[3]).to.deep.equal({
      role: ROLE.TOOL,
      content: [{ type: AGENT_EVENT.TOOL_RESULT, toolCallId: 'tc-1', toolName: 'my-tool', output: { type: 'text', value: 'done' } }],
    });
  });

  it('sets card state to error, commits no messages, and evicts from batch when isError is true', () => {
    const ctrl = makeController();
    ctrl._messages = [{ role: ROLE.USER, content: 'go' }];
    ctrl._pendingBatch = {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'my-tool', input: {} }],
      approvalRequests: [],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: {}, state: TOOL_STATE.RUNNING }],
    ]);

    ctrl._onToolResult('tc-1', 'my-tool', 'something went wrong', true, null);

    expect(ctrl._messages).to.have.lengthOf(1);
    expect(ctrl._toolCards.get('tc-1').state).to.equal(TOOL_STATE.ERROR);
    // Must be evicted so it cannot contaminate a later approval batch commit.
    expect(ctrl._pendingBatch.toolCalls).to.have.lengthOf(0);
  });

  it('merges a preceding text-only assistant message into the tool-call message', () => {
    const ctrl = makeController();
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      { role: ROLE.ASSISTANT, content: 'Now let me read the existing pages:' },
    ];
    ctrl._pendingBatch = {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'content_list', input: { path: '/a' } }],
      approvalRequests: [],
    };
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'content_list', input: { path: '/a' }, state: TOOL_STATE.RUNNING }],
    ]);

    ctrl._onToolResult('tc-1', 'content_list', 'result', false, null);

    // 3 messages: user + merged-assistant + tool-result (not 4 with separate text and tool-call)
    expect(ctrl._messages).to.have.lengthOf(3);
    expect(ctrl._messages[1]).to.deep.equal({
      role: ROLE.ASSISTANT,
      content: [
        { type: 'text', text: 'Now let me read the existing pages:' },
        { type: AGENT_EVENT.TOOL_CALL, toolCallId: 'tc-1', toolName: 'content_list', input: { path: '/a' } },
      ],
    });
    expect(ctrl._messages[2].role).to.equal(ROLE.TOOL);
  });
});

describe('ChatController — _onStreamFinish (finishReason)', () => {
  it('sets _pendingContinuation when finishReason is tool-calls and batch is empty', () => {
    const ctrl = makeController();
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      { role: ROLE.TOOL, content: [{ type: AGENT_EVENT.TOOL_RESULT, toolCallId: 'tc-1', output: 'ok' }] },
    ];

    ctrl._onStreamFinish('room-1', FINISH_REASON.TOOL_CALLS);

    expect(ctrl._pendingContinuation).to.be.true;
  });

  it('does not set _pendingContinuation when last message is role:assistant (prefill guard)', () => {
    const ctrl = makeController();
    ctrl._messages = [
      { role: ROLE.USER, content: 'go' },
      { role: ROLE.ASSISTANT, content: 'I will now create the files.' },
    ];

    ctrl._onStreamFinish('room-1', FINISH_REASON.TOOL_CALLS);

    expect(ctrl._pendingContinuation).to.not.be.true;
  });
});

describe('ChatController — _done (batch cleanup)', () => {
  it('does not end the turn when _activeApprovalStreams > 0', () => {
    // Scenario: sendMessage's stream ended (FINISH_MESSAGE received) while approveToolCall's
    // stream is still in progress. sendMessage's _done() must not set turn to IDLE — that
    // would incorrectly hide the thinking indicator and corrupt turn state.
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._turn.pause();
    ctrl._turn.resume(); // RESUMING — approval stream is in progress
    ctrl._activeApprovalStreams = 1;

    ctrl._done();

    expect(ctrl._turn.isActive).to.be.true; // turn still active
  });

  it('ends the turn normally when _activeApprovalStreams is 0', () => {
    const ctrl = makeController();
    ctrl._turn.begin();

    ctrl._done();

    expect(ctrl._turn.isActive).to.be.false;
  });

  it('does not end the turn when a second approval stream is still running (counter > 0 after first decrements)', () => {
    // Race: user approves tc-2 while stream C (tc-1's approval stream) is still open.
    // Stream C's finally decrements the counter but stream D (tc-2's) already incremented it.
    // Net counter = 1 — _done() from stream C must not end the turn.
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._turn.pause();
    ctrl._turn.resume(); // RESUMING
    ctrl._activeApprovalStreams = 1; // stream D incremented before stream C's finally ran

    ctrl._done(); // stream C's _done()

    expect(ctrl._turn.isActive).to.be.true;
  });

  it('does not end the turn when tool cards are still APPROVAL_REQUESTED', () => {
    // Per-tool streaming: after tc-1's stream finishes, tc-2 and tc-3 are still pending.
    // _done() must not end the turn — the turn should stay active so the UI keeps
    // showing the spinner and sendMessage remains blocked.
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._turn.pause();
    ctrl._turn.resume(); // RESUMING — approval streams ongoing
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: {}, state: TOOL_STATE.DONE, approvalId: 'ap-1' }],
      ['tc-2', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVAL_REQUESTED, approvalId: 'ap-2' }],
      ['tc-3', { toolName: 'my-tool', input: {}, state: TOOL_STATE.APPROVAL_REQUESTED, approvalId: 'ap-3' }],
    ]);

    ctrl._done(); // called after tc-1's stream finishes

    expect(ctrl._turn.isActive).to.be.true;
  });

  it('ends the turn in _done when no pending cards remain and no approval stream is active', () => {
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._turn.pause();
    ctrl._turn.resume();
    ctrl._toolCards = new Map([
      ['tc-1', { toolName: 'my-tool', input: {}, state: TOOL_STATE.DONE, approvalId: 'ap-1' }],
      ['tc-2', { toolName: 'my-tool', input: {}, state: TOOL_STATE.DONE, approvalId: 'ap-2' }],
    ]);

    ctrl._done();

    expect(ctrl._turn.isActive).to.be.false;
  });

  it('clears _pendingBatch before triggering continuation stream', async () => {
    const ctrl = makeController();
    ctrl._turn.begin();
    ctrl._pendingContinuation = true;
    ctrl._pendingBatch = {
      toolCalls: [{ toolCallId: 'stale', toolName: 'my-tool', input: {} }],
      approvalRequests: [],
    };

    let batchAtStreamTime;
    const started = new Promise((resolve) => {
      ctrl._stream = () => {
        batchAtStreamTime = { toolCalls: [...ctrl._pendingBatch.toolCalls] };
        resolve();
        return Promise.resolve();
      };
    });

    ctrl._done();
    await started;

    expect(batchAtStreamTime.toolCalls).to.have.lengthOf(0);
  });
});

describe('ChatController — sendMessage', () => {
  describe('guards', () => {
    it('does nothing when turn is already active', async () => {
      const ctrl = makeController();
      ctrl._isConnected = true;
      ctrl._turn.begin();
      await ctrl.sendMessage('hi', [], {});
      expect(ctrl._messages).to.be.undefined;
    });

    it('does nothing when not connected', async () => {
      const ctrl = makeController();
      // _isConnected is undefined by default
      await ctrl.sendMessage('hi', [], {});
      expect(ctrl._messages).to.be.undefined;
    });
  });

  describe('error handling', () => {
    it('appends an error message when stream throws', async () => {
      const ctrl = makeController();
      ctrl._isConnected = true;
      ctrl._stream = () => Promise.reject(new Error('network failure'));
      await ctrl.sendMessage('hi', [], {});
      expect(ctrl._messages.at(-1)).to.deep.equal({
        role: 'assistant',
        content: 'Error: network failure',
      });
    });

    it('does not append an error message when stream is aborted', async () => {
      const ctrl = makeController();
      ctrl._isConnected = true;
      ctrl._stream = () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      await ctrl.sendMessage('hi', [], {});
      expect(ctrl._messages.at(-1).role).to.equal('user');
    });
  });
});
