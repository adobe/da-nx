import { expect } from '@esm-bundle/chai';
import { stripOrphanedToolCallMessages, buildUserMessage } from '../../../../../nx2/blocks/chat/utils/messages.js';

// Helpers to build message shapes without repeating boilerplate.
const user = (content = 'hello') => ({ role: 'user', content });
const text = (content = 'ok') => ({ role: 'assistant', content });
const toolCall = (toolCallId, toolName = 'do-thing', input = {}) => ({
  role: 'assistant',
  content: [{ type: 'tool-call', toolCallId, toolName, input }],
});
const toolResult = (toolCallId, toolName = 'do-thing', output = 'done') => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId, toolName, output }],
});
const approvalBatch = (calls, requests) => ({
  role: 'assistant',
  content: [
    ...calls.map(({ toolCallId, toolName = 'do-thing', input = {} }) => ({
      type: 'tool-call', toolCallId, toolName, input,
    })),
    ...requests.map(({ approvalId, toolCallId }) => ({
      type: 'tool-approval-request', approvalId, toolCallId,
    })),
  ],
});
const approvalResponse = (approvalId, approved = true) => ({
  role: 'tool',
  content: [{ type: 'tool-approval-response', approvalId, approved }],
});

describe('stripOrphanedToolCallMessages', () => {
  describe('no-op cases — nothing to strip', () => {
    it('returns empty array unchanged', () => {
      expect(stripOrphanedToolCallMessages([])).to.deep.equal([]);
    });

    it('passes through user and text-only assistant messages', () => {
      const msgs = [user('hi'), text('hello back')];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal(msgs);
    });

    it('keeps a non-approval tool-call that has a result', () => {
      const msgs = [user(), toolCall('id-1'), toolResult('id-1'), text()];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal(msgs);
    });

    it('keeps a complete approval batch (request + response) while tool result is absent and tool is live', () => {
      // Response exists and tool is actively executing — keep both so da-agent can execute.
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
        approvalResponse('ap-1'),
      ];
      expect(stripOrphanedToolCallMessages(msgs, {
        liveToolCallIds: new Set(['id-1']),
      })).to.deep.equal(msgs);
    });

    it('strips the approval-response and approval-request once the tool result is present', () => {
      // When a tool-result exists, both the approval-response and approval-request are stale.
      // The approval-response is dropped to avoid "unknown approvalId" in da-agent's streamText.
      // The approval-request is also stripped from the assistant message so da-agent sees a
      // plain tool_call → tool_result pair rather than an unresolved approval.
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
        approvalResponse('ap-1'),
        toolResult('id-1'),
        text(),
      ];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal([
        user(),
        toolCall('id-1'), // approval_request stripped — only tool_call remains
        toolResult('id-1'),
        text(),
      ]);
    });

    it('strips approval-responses and approval-requests for a parallel batch once tool results exist', () => {
      const msgs = [
        user(),
        approvalBatch(
          [{ toolCallId: 'id-1' }, { toolCallId: 'id-2' }],
          [{ approvalId: 'ap-1', toolCallId: 'id-1' }, { approvalId: 'ap-2', toolCallId: 'id-2' }],
        ),
        approvalResponse('ap-1'),
        approvalResponse('ap-2'),
        toolResult('id-1'),
        toolResult('id-2'),
        text(),
      ];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal([
        user(),
        // Both approval_requests stripped — assistant message has only the two tool_calls
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', toolCallId: 'id-1', toolName: 'do-thing', input: {} },
            { type: 'tool-call', toolCallId: 'id-2', toolName: 'do-thing', input: {} },
          ],
        },
        toolResult('id-1'),
        toolResult('id-2'),
        text(),
      ]);
    });
  });

  describe('stripping cases', () => {
    it('strips an assistant message whose tool-call has no result', () => {
      const msgs = [user(), toolCall('id-1')];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal([user()]);
    });

    it('strips an approval batch where the request has no response', () => {
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
      ];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal([user()]);
    });

    it('strips an orphaned approval response that has no matching request', () => {
      // Response references approvalId that was never in an assistant message.
      const msgs = [user(), approvalResponse('ap-ghost')];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal([user()]);
    });

    it('strips an entire parallel batch when one tool-call has no result', () => {
      // Both id-1 and id-2 are in the same assistant message.
      // id-2 has no result — the whole message must be stripped.
      const msgs = [
        user(),
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', toolCallId: 'id-1', toolName: 'do-thing', input: {} },
            { type: 'tool-call', toolCallId: 'id-2', toolName: 'do-thing', input: {} },
          ],
        },
        toolResult('id-1'),
      ];
      const result = stripOrphanedToolCallMessages(msgs);
      // Assistant message stripped; tool result for id-1 kept (it's not an approval-response)
      expect(result).to.deep.equal([user(), toolResult('id-1')]);
    });

    it('strips a parallel approval batch whose assistant message is incomplete', () => {
      // ap-2 has no response → batch stripped. ap-1 has a complete approval but no tool result
      // and is not live → its response is also stripped (would cause orphaned tool_use).
      const msgs = [
        user(),
        approvalBatch(
          [{ toolCallId: 'id-1' }, { toolCallId: 'id-2' }],
          [{ approvalId: 'ap-1', toolCallId: 'id-1' }, { approvalId: 'ap-2', toolCallId: 'id-2' }],
        ),
        approvalResponse('ap-1'),
        // ap-2 never responded
      ];
      const result = stripOrphanedToolCallMessages(msgs);
      expect(result).to.deep.equal([user()]);
    });
  });

  describe('mixed sequences', () => {
    it('strips only the unresolved tool, keeps the resolved one', () => {
      const msgs = [
        user(),
        toolCall('id-1'),
        toolResult('id-1'),
        text('after first'),
        user('second ask'),
        toolCall('id-2'),
        // id-2 has no result
      ];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal([
        user(),
        toolCall('id-1'),
        toolResult('id-1'),
        text('after first'),
        user('second ask'),
      ]);
    });

    it('strips an approval batch where response exists but tool result is missing (not live)', () => {
      // Approval complete but tool result never arrived and tool is not in liveToolCallIds
      // (e.g. session loaded from persistence after an interrupted stream). Keeping this
      // would cause da-agent to forward an unresolved tool_use to Anthropic.
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
        approvalResponse('ap-1'),
        // tool result never arrived
      ];
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal([user()]);
    });

    it('keeps an approval batch with no tool result when tool is live', () => {
      // Tool is actively executing — approval given, result not yet back.
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
        approvalResponse('ap-1'),
      ];
      const result = stripOrphanedToolCallMessages(msgs, {
        liveToolCallIds: new Set(['id-1']),
      });
      expect(result).to.deep.equal(msgs);
    });

    it('strips only the incomplete approval, keeps the complete one (stale response and request also stripped)', () => {
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
        approvalResponse('ap-1'),
        toolResult('id-1'),
        text('first done'),
        user('second ask'),
        approvalBatch([{ toolCallId: 'id-2' }], [{ approvalId: 'ap-2', toolCallId: 'id-2' }]),
        // ap-2 never responded
      ];
      // ap-1 resolved: response stripped (stale), approval-request stripped from assistant message.
      // ap-2 stripped (no response).
      expect(stripOrphanedToolCallMessages(msgs)).to.deep.equal([
        user(),
        toolCall('id-1'), // approval-request stripped — only tool_call remains
        toolResult('id-1'),
        text('first done'),
        user('second ask'),
      ]);
    });
  });

  describe('liveToolCallIds option', () => {
    it('keeps a sibling approval message when its tool is in liveToolCallIds', () => {
      // tc-2 has no response yet but is actively pending — keep so da-agent sees it
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
        approvalBatch([{ toolCallId: 'id-2' }], [{ approvalId: 'ap-2', toolCallId: 'id-2' }]),
        approvalResponse('ap-1'),
      ];
      const result = stripOrphanedToolCallMessages(msgs, {
        liveToolCallIds: new Set(['id-1', 'id-2']),
      });
      expect(result).to.deep.equal(msgs);
    });

    it('without liveToolCallIds: strips all approval sequences that have no tool result', () => {
      // Neither id-1 nor id-2 has a tool result and neither is live → both stripped entirely.
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
        approvalBatch([{ toolCallId: 'id-2' }], [{ approvalId: 'ap-2', toolCallId: 'id-2' }]),
        approvalResponse('ap-1'),
      ];
      const result = stripOrphanedToolCallMessages(msgs);
      expect(result).to.deep.equal([user()]);
    });

    it('per-tool streaming: keeps siblings live, strips stale approval-response after resolution', () => {
      // Stream C scenario: tc-1 already done (tr-1 present), tc-2 just approved (tar-resp-2),
      // tc-3 still pending (APPROVAL_REQUESTED). tar-resp-1 must be stripped (stale).
      // Both tc-2 and tc-3 assistant messages must be kept (live).
      const msgs = [
        user(),
        approvalBatch([{ toolCallId: 'id-1' }], [{ approvalId: 'ap-1', toolCallId: 'id-1' }]),
        approvalBatch([{ toolCallId: 'id-2' }], [{ approvalId: 'ap-2', toolCallId: 'id-2' }]),
        approvalBatch([{ toolCallId: 'id-3' }], [{ approvalId: 'ap-3', toolCallId: 'id-3' }]),
        approvalResponse('ap-1'),
        toolResult('id-1'),
        approvalResponse('ap-2'),
      ];
      const result = stripOrphanedToolCallMessages(msgs, {
        liveToolCallIds: new Set(['id-2', 'id-3']),
      });
      expect(result).to.deep.equal([
        user(),
        toolCall('id-1'), // approval-request stripped (id-1 resolved) — only tool_call remains
        approvalBatch([{ toolCallId: 'id-2' }], [{ approvalId: 'ap-2', toolCallId: 'id-2' }]),
        approvalBatch([{ toolCallId: 'id-3' }], [{ approvalId: 'ap-3', toolCallId: 'id-3' }]),
        toolResult('id-1'),
        approvalResponse('ap-2'),
      ]);
    });
  });
});

describe('buildUserMessage', () => {
  describe('base shape', () => {
    it('returns role:user with content when context and attachments are empty', () => {
      const result = buildUserMessage('hello', [], []);
      expect(result).to.deep.equal({ role: 'user', content: 'hello' });
    });
  });

  describe('selectionContext', () => {
    it('includes items with proseIndex', () => {
      const result = buildUserMessage('hi', [{ proseIndex: 2, innerText: 'some text' }], []);
      expect(result.selectionContext).to.deep.equal([{ proseIndex: 2, innerText: 'some text' }]);
    });

    it('includes items with blockName', () => {
      const result = buildUserMessage('hi', [{ blockName: 'hero', innerText: 'hi' }], []);
      expect(result.selectionContext).to.deep.equal([{ blockName: 'hero', innerText: 'hi' }]);
    });

    it('includes items with both proseIndex and blockName', () => {
      const result = buildUserMessage('hi', [{ proseIndex: 0, blockName: 'columns', innerText: 'x' }], []);
      expect(result.selectionContext).to.deep.equal([{ proseIndex: 0, blockName: 'columns', innerText: 'x' }]);
    });

    it('omits innerText when not present', () => {
      const result = buildUserMessage('hi', [{ proseIndex: 1 }], []);
      expect(result.selectionContext).to.deep.equal([{ proseIndex: 1 }]);
    });

    it('filters out items with neither proseIndex nor blockName', () => {
      const context = [
        { innerText: 'no index or name' },
        { proseIndex: 3, innerText: 'valid' },
      ];
      const result = buildUserMessage('hi', context, []);
      expect(result.selectionContext).to.deep.equal([{ proseIndex: 3, innerText: 'valid' }]);
    });

    it('omits selectionContext entirely when all items are filtered out', () => {
      const result = buildUserMessage('hi', [{ innerText: 'no index or name' }], []);
      expect(result).to.not.have.property('selectionContext');
    });

    it('treats proseIndex: 0 as valid (falsy but is a number)', () => {
      const result = buildUserMessage('hi', [{ proseIndex: 0 }], []);
      expect(result.selectionContext).to.deep.equal([{ proseIndex: 0 }]);
    });
  });

  describe('attachmentsMeta', () => {
    it('maps attachments to id, fileName, mediaType, sizeBytes', () => {
      const attachments = [{ id: 'a1', fileName: 'img.png', mediaType: 'image/png', sizeBytes: 1024, dataBase64: 'abc' }];
      const result = buildUserMessage('hi', [], attachments);
      expect(result.attachmentsMeta).to.deep.equal([
        { id: 'a1', fileName: 'img.png', mediaType: 'image/png', sizeBytes: 1024 },
      ]);
    });

    it('omits sizeBytes when undefined', () => {
      const attachments = [{ id: 'a1', fileName: 'doc.pdf', mediaType: 'application/pdf' }];
      const result = buildUserMessage('hi', [], attachments);
      expect(result.attachmentsMeta[0]).to.not.have.property('sizeBytes');
    });

    it('keeps sizeBytes when 0', () => {
      const attachments = [{ id: 'a1', fileName: 'empty.txt', mediaType: 'text/plain', sizeBytes: 0 }];
      const result = buildUserMessage('hi', [], attachments);
      expect(result.attachmentsMeta[0].sizeBytes).to.equal(0);
    });

    it('strips extra fields like dataBase64 and contentUrl', () => {
      const attachments = [{ id: 'a1', fileName: 'f.png', mediaType: 'image/png', dataBase64: 'xyz', contentUrl: 'https://...' }];
      const result = buildUserMessage('hi', [], attachments);
      const meta = result.attachmentsMeta[0];
      expect(meta).to.not.have.property('dataBase64');
      expect(meta).to.not.have.property('contentUrl');
    });
  });
});
