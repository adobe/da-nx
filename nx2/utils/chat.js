import { hashChange } from './utils.js';
import { getCoworkerConfig, isCmaFlagEnabled } from './ewFlags.js';
import { isCmaEntitled } from './entitlement.js';

export const CHAT_EVENT = {
  // Chat -> document: notifications chat dispatches when something happened.
  AGENT_CHANGE: 'nx-agent-change',
  TURN_COMPLETED: 'nx-chat-turn-completed',
  HIGHLIGHT_SELECTION: 'nx-highlight-selection',

  // document -> chat: commands other components dispatch for chat to act on.
  ADD_TO_CHAT: 'nx-add-to-chat',
  SET_PROMPT: 'nx-set-prompt', // see docs/chat-ui-component.md#setting-a-prompt-programmatically
};

// Dev override, not persisted: ?nx-chat-ao=true forces AO for this load regardless
// of the org/site's `ew.coworker` flag. Anything else falls through to the flag.
const AO_CHAT_KEY = 'nx-chat-ao';

async function resolveAoChatConfig(context) {
  const query = new URLSearchParams(window.location.search).get(AO_CHAT_KEY);

  let state = context;
  if (!state) {
    const unsubscribe = hashChange.subscribe((s) => { state = s; });
    unsubscribe();
  }

  const { org, site } = state ?? {};
  const key = org && site ? `${org}/${site}` : null;
  if (!org || !site) {
    return {
      useAoChat: query === 'true',
      key,
      cma: false,
    };
  }

  const [{ enabled: coworkerEnabled }, cmaFlagEnabled, entitled] = await Promise.all([
    getCoworkerConfig({ org, site }),
    isCmaFlagEnabled({ org, site }),
    isCmaEntitled(),
  ]);
  const cma = cmaFlagEnabled && entitled;
  // ew.coworker and ew.cma are independent flags, not a single either/or.
  // When both are on but the org isn't CMA-entitled, Coworker wins by design
  // (ew.cma requires entitlement, ew.coworker doesn't); warn so it doesn't
  // read as a silent fallback.
  if (cmaFlagEnabled && coworkerEnabled && !entitled) {
    // eslint-disable-next-line no-console
    console.warn(
      `[chat] ${key}: both ew.cma and ew.coworker enabled but org isn't `
      + 'CMA-entitled; using Coworker (ew.cma requires entitlement).',
    );
  }
  return {
    useAoChat: query === 'true' || coworkerEnabled || cma,
    key,
    cma,
  };
}

export async function useAoChat() {
  const { useAoChat: enabled } = await resolveAoChatConfig();
  return enabled;
}

export async function loadChat({ context } = {}) {
  const {
    useAoChat: enabled,
    key,
    cma,
  } = await resolveAoChatConfig(context);
  if (enabled) {
    await import('../blocks/chat-ao/chat-ao.js');
    const chat = document.createElement('nx-chat-ao');
    chat.harnessConfig = { key, cma };
    return chat;
  }
  await import('../blocks/chat/chat.js');
  return document.createElement('nx-chat');
}
