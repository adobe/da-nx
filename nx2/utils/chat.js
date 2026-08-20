export const CHAT_EVENT = {
  // Chat -> document: notifications chat dispatches when something happened.
  AGENT_CHANGE: 'nx-agent-change',
  HIGHLIGHT_SELECTION: 'nx-highlight-selection',

  // document -> chat: commands other components dispatch for chat to act on.
  ADD_TO_CHAT: 'nx-add-to-chat',
};

export async function loadChat() {
  await import('../blocks/chat/chat.js');
  return document.createElement('nx-chat');
}
