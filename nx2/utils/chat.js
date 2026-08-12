export const CHAT_EVENT = {
  // Chat -> document: notifications chat dispatches when something happened.
  AGENT_CHANGE: 'nx-agent-change',
  HIGHLIGHT_SELECTION: 'nx-highlight-selection',

  // document -> chat: commands other components dispatch for chat to act on.
  ADD_TO_CHAT: 'nx-add-to-chat',
};

// Dev-only override for now — swap for a real per-org/site decision once nx-chat-ao
// is ready to take over from nx-chat. Set with ?nx-chat-ao=true (persists via
// localStorage across reloads); ?nx-chat-ao=reset clears it back to the default.
const AO_CHAT_KEY = 'nx-chat-ao';

function useAoChat() {
  const query = new URLSearchParams(window.location.search).get(AO_CHAT_KEY);
  if (query === 'reset') {
    localStorage.removeItem(AO_CHAT_KEY);
  } else if (query) {
    localStorage.setItem(AO_CHAT_KEY, query);
  }
  return localStorage.getItem(AO_CHAT_KEY) === 'true';
}

export async function loadChat() {
  if (useAoChat()) {
    await import('../blocks/chat-ao/chat-ao.js');
    return document.createElement('nx-chat-ao');
  }
  await import('../blocks/chat/chat.js');
  return document.createElement('nx-chat');
}
