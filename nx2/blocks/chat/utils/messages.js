import { AGENT_EVENT, ROLE } from '../constants.js';

export const wrapOutput = (output) => (
  typeof output === 'string'
    ? { type: 'text', value: output }
    : { type: 'json', value: output }
);

export function buildUserMessage(message, context, attachments) {
  const selectionContext = context
    .filter(({ proseIndex, blockName }) => typeof proseIndex === 'number' || blockName)
    .map(({ proseIndex, blockName, innerText }) => {
      const item = {};
      if (typeof proseIndex === 'number') item.proseIndex = proseIndex;
      if (blockName) item.blockName = blockName;
      if (innerText) item.innerText = innerText;
      return item;
    });

  const attachmentsMeta = attachments.map(({ id, fileName, mediaType, sizeBytes }) => ({
    id,
    fileName,
    mediaType,
    ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
  }));

  return {
    role: ROLE.USER,
    content: message,
    ...(selectionContext.length && { selectionContext }),
    ...(attachmentsMeta.length && { attachmentsMeta }),
  };
}

// Without this the agent rejects with "tool_use ids without tool_result blocks".
export function stripOrphanedToolCallMessages(messages, { liveToolCallIds = new Set() } = {}) {
  const assistantParts = messages
    .filter((msg) => msg.role === ROLE.ASSISTANT && Array.isArray(msg.content))
    .flatMap((msg) => msg.content);

  const toolParts = messages
    .filter((msg) => msg.role === ROLE.TOOL && Array.isArray(msg.content))
    .flatMap((msg) => msg.content);

  const resolvedIds = new Set(
    toolParts.filter((p) => p.type === AGENT_EVENT.TOOL_RESULT).map((p) => p.toolCallId),
  );
  const requestedApprovalIds = new Set(
    assistantParts
      .filter((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_REQUEST)
      .map((p) => p.approvalId),
  );
  const respondedApprovalIds = new Set(
    toolParts
      .filter((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_RESPONSE)
      .map((p) => p.approvalId),
  );

  const completeApprovalIds = new Set(
    [...respondedApprovalIds].filter((id) => requestedApprovalIds.has(id)),
  );

  const approvalIdToCallId = new Map(
    assistantParts
      .filter((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_REQUEST && p.approvalId && p.toolCallId)
      .map((p) => [p.approvalId, p.toolCallId]),
  );

  // Stripping the approval-response requires stripping its approval-request too — otherwise a
  // re-run sees a request with no response, strips the whole assistant message, and orphans
  // the tool-result.
  const staleApprovalIds = new Set(
    [...completeApprovalIds].filter((id) => {
      const callId = approvalIdToCallId.get(id);
      return callId && resolvedIds.has(callId);
    }),
  );

  return messages
    .filter((msg) => {
      if (msg.role === ROLE.TOOL && Array.isArray(msg.content)) {
        const resp = msg.content.find((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_RESPONSE);
        if (!resp) return true;
        if (!completeApprovalIds.has(resp.approvalId)) return false; // orphaned request
        const callId = approvalIdToCallId.get(resp.approvalId);
        return callId ? liveToolCallIds.has(callId) : true; // strip when stale or abandoned
      }

      if (msg.role !== ROLE.ASSISTANT || !Array.isArray(msg.content)) return true;

      const calls = msg.content.filter((p) => p.type === AGENT_EVENT.TOOL_CALL);
      if (!calls.length) return true;

      // Keep if any call is live so the agent sees all pending approvals.
      if (calls.some((c) => liveToolCallIds.has(c.toolCallId))) return true;

      const approvals = msg.content.filter((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_REQUEST);

      // liveToolCallIds handles the in-flight case — everything reaching here is historical.
      return approvals.length
        ? approvals.every((a) => completeApprovalIds.has(a.approvalId))
        && calls.every((c) => resolvedIds.has(c.toolCallId))
        : calls.every((c) => resolvedIds.has(c.toolCallId));
    })
    .map((msg) => {
      if (msg.role !== ROLE.ASSISTANT || !Array.isArray(msg.content) || !staleApprovalIds.size) {
        return msg;
      }
      const isStale = (p) => (
        p.type === AGENT_EVENT.TOOL_APPROVAL_REQUEST && staleApprovalIds.has(p.approvalId)
      );
      const cleaned = msg.content.filter((p) => !isStale(p));
      return cleaned.length !== msg.content.length ? { ...msg, content: cleaned } : msg;
    });
}

// Previous turns' tool sequences are stripped to avoid agent errors from imperfect pairs.
// The current turn (from the last user message onward) is kept for active tool context.
export function buildAgentMessages(messages, { liveToolCallIds = new Set() } = {}) {
  const lastUserIdx = messages.reduce((acc, msg, i) => (msg.role === ROLE.USER ? i : acc), -1);
  const sanitized = messages.flatMap((msg, idx) => {
    if (idx >= lastUserIdx) return [msg];
    if (msg.role === ROLE.TOOL) return [];
    if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)) {
      const text = msg.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
      return text ? [{ role: ROLE.ASSISTANT, content: text }] : [];
    }
    return [msg];
  });
  return stripOrphanedToolCallMessages(sanitized, { liveToolCallIds });
}
