import { hashChange } from './utils.js';
import { getCoworkerConfig } from './ewFlags.js';

export const CHAT_EVENT = {
  // Chat -> document: notifications chat dispatches when something happened.
  AGENT_CHANGE: 'nx-agent-change',
  HIGHLIGHT_SELECTION: 'nx-highlight-selection',

  // document -> chat: commands other components dispatch for chat to act on.
  ADD_TO_CHAT: 'nx-add-to-chat',
  SET_PROMPT: 'nx-set-prompt', // see docs/chat-ui-component.md#setting-a-prompt-programmatically
};

// Dev override, not persisted: ?nx-chat-ao=true forces AO for this load regardless
// of the org/site's `ew.coworker` flag. Anything else falls through to the flag.
const AO_CHAT_KEY = 'nx-chat-ao';

async function resolveAoChatConfig() {
  const query = new URLSearchParams(window.location.search).get(AO_CHAT_KEY);

  let state;
  const unsubscribe = hashChange.subscribe((s) => { state = s; });
  unsubscribe();

  const { org, site } = state ?? {};
  const key = org && site ? `${org}/${site}` : null;
  if (!org || !site) {
    return {
      useAoChat: query === 'true',
      key,
      altHarness: false,
      activationKey: null,
    };
  }

  const { enabled, altHarness, activationKey } = await getCoworkerConfig({ org, site });
  return {
    useAoChat: query === 'true' || enabled,
    key,
    altHarness,
    activationKey,
  };
}

export async function useAoChat() {
  const { useAoChat: enabled } = await resolveAoChatConfig();
  return enabled;
}

export async function loadChat() {
  const {
    useAoChat: enabled,
    key,
    altHarness,
    activationKey,
  } = await resolveAoChatConfig();
  if (enabled) {
    await import('../blocks/chat-ao/chat-ao.js');
    const chat = document.createElement('nx-chat-ao');
    chat.harnessConfig = { key, altHarness, activationKey };
    return chat;
  }
  await import('../blocks/chat/chat.js');
  return document.createElement('nx-chat');
}
