import { registerPanelSection, wasPanelOpen, PANEL_EVENT } from '../../../nx2/utils/panel.js';
import { hashChange } from '../../../nx2/utils/utils.js';
import { CHAT_EVENT, loadChat } from '../../../nx2/utils/chat.js';
import { getConfig } from '../../../nx2/scripts/nx.js';
import { isEwChatEnabled } from '../../../nx2/utils/ewFlags.js';

export async function setupPanels({ org, repo }) {
  const [, view, appOrg, appSite] = window.location.pathname.split('/');
  const isSiteApp = Boolean(org && repo && view === 'app' && appOrg === org && appSite === repo);
  const getContext = () => {
    let context;
    const unsubscribe = hashChange.subscribe((state) => { context = state; });
    unsubscribe();
    return context?.site
      ? { ...context, view: 'browse' } : { org, site: repo, path: null, view: 'browse' };
  };
  let chatContext = getContext();
  let chatEnabled = isSiteApp && await isEwChatEnabled(chatContext);
  let unregisterChat;
  let chatCheck = Promise.resolve();
  let supersedeCheck;

  const registerChat = () => {
    unregisterChat = registerPanelSection('chat', {
      position: 'before',
      width: '400px',
      getContent: async () => loadChat({ context: getContext() }),
      onShow: async (aside, _, options) => {
        const chat = aside.querySelector('nx-chat, nx-chat-ao');
        chat.context = getContext();
        await chat.updateComplete;
        if (!chatEnabled || !aside.isConnected) return;
        if (typeof options?.text !== 'string') return;
        document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
          detail: { text: options.text, autoSend: options.autoSend === true },
        }));
      },
    });
  };
  if (chatEnabled) registerChat();

  const syncChat = () => {
    const context = getContext();
    if (context.org === chatContext.org && context.site === chatContext.site) return chatCheck;
    const reopen = wasPanelOpen('chat');
    chatContext = context;
    chatEnabled = false;
    unregisterChat?.();
    supersedeCheck?.();
    const superseded = new Promise((resolve) => { supersedeCheck = resolve; });
    const checking = (async () => {
      try {
        const enabled = isSiteApp && await isEwChatEnabled(context);
        if (chatContext !== context) return;
        chatEnabled = enabled;
        if (chatEnabled) {
          registerChat();
          if (reopen) {
            document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat' } }));
          }
        }
      } catch (error) {
        getConfig().log(error);
      }
    })();
    chatCheck = Promise.race([checking, superseded]);
    return chatCheck;
  };

  const onMessage = ({ action, details }) => {
    if (action === 'setPrompt') {
      if (!chatEnabled) return;
      if (typeof details?.text !== 'string') {
        getConfig().log(new Error(`${action} requires a text string.`));
        return;
      }
      document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
        detail: { section: 'chat', options: details },
      }));
    } else if (action === 'showPanel' && typeof details === 'string') {
      if (details === 'chat' && !chatEnabled) return;
      document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
        detail: { section: details },
      }));
    }
  };

  return {
    async ready() {
      let current;
      do {
        current = syncChat();
        await current;
      } while (current !== chatCheck);
    },
    get capabilities() {
      return chatEnabled ? { chatTurnCompleted: 1 } : {};
    },
    connect(port) {
      const unsubscribeHash = hashChange.subscribe(syncChat);
      const onTurnCompleted = ({ detail }) => {
        if (chatEnabled) port.postMessage({ action: 'chatTurnCompleted', detail });
      };
      const unsubscribeTurns = () => {
        document.removeEventListener(CHAT_EVENT.TURN_COMPLETED, onTurnCompleted);
      };
      return {
        onMessage(message) {
          if (message.action === 'subscribeChatTurnCompleted' && chatEnabled) {
            document.addEventListener(CHAT_EVENT.TURN_COMPLETED, onTurnCompleted);
          } else if (message.action === 'unsubscribeChatTurnCompleted') {
            unsubscribeTurns();
          } else {
            onMessage(message);
          }
        },
        destroy() {
          unsubscribeHash();
          unsubscribeTurns();
        },
      };
    },
  };
}
