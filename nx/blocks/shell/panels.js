import { registerPanelSection, PANEL_EVENT } from '../../../nx2/utils/panel.js';
import { hashChange } from '../../../nx2/utils/utils.js';
import { CHAT_EVENT, loadChat } from '../../../nx2/utils/chat.js';
import { getConfig } from '../../../nx2/scripts/nx.js';
import { isEwChatDisabled } from '../../../nx2/utils/ewFlags.js';

export async function setupPanels({ org, repo }) {
  const [, view, appOrg, appSite] = window.location.pathname.split('/');
  const isSiteApp = Boolean(org && repo && view === 'app' && appOrg === org && appSite === repo);
  const chatEnabled = isSiteApp && !await isEwChatDisabled({ org, site: repo });
  const getContext = () => {
    let context;
    const unsubscribe = hashChange.subscribe((state) => { context = state; });
    unsubscribe();
    return context?.site
      ? { ...context, view: 'browse' } : { org, site: repo, path: null, view: 'browse' };
  };

  if (chatEnabled) {
    registerPanelSection('chat', {
      position: 'before',
      width: '400px',
      getContent: async () => loadChat({ context: getContext() }),
      onShow: async (aside, _, options) => {
        const chat = aside.querySelector('nx-chat, nx-chat-ao');
        chat.context = getContext();
        await chat.updateComplete;
        if (typeof options?.text !== 'string') return;
        document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
          detail: { text: options.text, autoSend: options.autoSend === true },
        }));
      },
    });
  }

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
    capabilities: chatEnabled ? { chatTurnCompleted: 1 } : {},
    connect(port) {
      const onTurnCompleted = ({ detail }) => {
        port.postMessage({ action: 'chatTurnCompleted', detail });
      };
      const destroy = () => {
        document.removeEventListener(CHAT_EVENT.TURN_COMPLETED, onTurnCompleted);
      };
      return {
        onMessage(message) {
          if (message.action === 'subscribeChatTurnCompleted' && chatEnabled) {
            document.addEventListener(CHAT_EVENT.TURN_COMPLETED, onTurnCompleted);
          } else if (message.action === 'unsubscribeChatTurnCompleted') {
            destroy();
          } else {
            onMessage(message);
          }
        },
        destroy,
      };
    },
  };
}
