import { hashChange } from './utils.js';
import { isCoworkerEnabled } from './ewFlags.js';

export const CHAT_EVENT = {
  // Chat -> document: notifications chat dispatches when something happened.
  AGENT_CHANGE: 'nx-agent-change',
  HIGHLIGHT_SELECTION: 'nx-highlight-selection',

  // document -> chat: commands other components dispatch for chat to act on.
  ADD_TO_CHAT: 'nx-add-to-chat',
};

// Dev override, not persisted: ?nx-chat-ao=true forces AO for this load regardless
// of the org/site's `ew.coworker` flag. Anything else falls through to the flag.
const AO_CHAT_KEY = 'nx-chat-ao';

export async function useAoChat() {
  const query = new URLSearchParams(window.location.search).get(AO_CHAT_KEY);
  if (query === 'true') return true;

  let state;
  const unsubscribe = hashChange.subscribe((s) => { state = s; });
  unsubscribe();

  const { org, site } = state ?? {};
  if (!org || !site) return false;
  return isCoworkerEnabled({ org, site });
}

export async function loadChat() {
  if (await useAoChat()) {
    await import('../blocks/chat-ao/chat-ao.js');
    return document.createElement('nx-chat-ao');
  }
  await import('../blocks/chat/chat.js');
  return document.createElement('nx-chat');
}
