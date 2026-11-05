import CoworkerChatController from './coworker-chat-controller.js';
import CmaChatController from './cma-chat-controller.js';
import { CHAT_EVENT } from '../../utils/chat.js';

const sessions = new Map();
const inputs = new Map();

export function getSessionScope({ org, site, cma }) {
  return JSON.stringify([org, site, cma ? 'cma' : 'coworker']);
}

export function getAoSession({
  context, owner, isolated = false, cma = false,
}) {
  const { org, site } = context;
  const scope = getSessionScope({ org, site, cma });
  // Only non-isolated sessions count as reuse candidates; an isolated sibling
  // in the same scope must not force an unrelated request into isolation.
  const matching = [...sessions.keys()].filter(
    (session) => session.scope === scope && !session.isolated,
  );
  const available = !isolated && matching.find((session) => (
    ![...sessions.get(session).keys()].some((view) => view.localName === owner.localName)
  ));
  if (available) return available;

  const subscribers = new Map();
  let state = { messages: [], loadingEpisode: true };
  let initialized = false;
  let destroyed = false;
  let sending = false;
  const notify = () => subscribers.forEach(({ onUpdate }) => onUpdate(state));
  const publish = (next) => {
    if (destroyed) return;
    state = next;
    if (!state.thinking) sending = false;
    notify();
  };
  const Controller = cma ? CmaChatController : CoworkerChatController;
  const controller = new Controller({
    onUpdate: publish,
    onTurnCompleted: (detail) => {
      subscribers.forEach(({ onTurnCompleted }) => onTurnCompleted?.(detail));
    },
    isolated: isolated || matching.length > 0,
  });
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && initialized) controller.reattachIfIdle?.();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const session = {
    scope,
    isolated,
    controller,
    ready: Promise.resolve().then(async () => {
      if (destroyed) return;
      try {
        controller.setContext(context);
        await Promise.all([controller.loadEpisodes(), controller.loadSkills()]);
        if (destroyed) return;
        initialized = true;
        notify();
      } catch (error) {
        publish({
          messages: [{ role: 'assistant', content: `Error: ${error.message}` }],
          thinking: false,
          loadingEpisode: false,
        });
      }
    }),
    subscribe(view, callbacks) {
      subscribers.set(view, callbacks);
      notify();
      return () => {
        subscribers.delete(view);
        if (subscribers.size || destroyed) return;
        destroyed = true;
        sessions.delete(session);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        controller.destroy();
      };
    },
    send({ context: currentContext, args }) {
      if (destroyed || !initialized || sending || state.loadingEpisode
        || (state.thinking && !state.pendingPlanApproval)) return false;
      controller.setContext(currentContext);
      sending = true;
      try {
        Promise.resolve(controller.sendMessage(...args))
          .catch((error) => publish({
            ...state, thinking: false, messages: [...(state.messages ?? []), { role: 'assistant', content: `Error: ${error.message}` }],
          }))
          .finally(() => { sending = false; });
        return true;
      } catch (error) {
        sending = false;
        throw error;
      }
    },
  };
  sessions.set(session, subscribers);
  return session;
}

function routeEvent(event) {
  const {
    target, org, site, ...detail
  } = event.detail ?? {};
  const candidates = [...inputs.keys()].filter((owner) => (
    (!target || target === owner)
    && (org === undefined || org === inputs.get(owner).getContext?.()?.org)
    && (site === undefined || site === inputs.get(owner).getContext?.()?.site)
  ));
  const focused = candidates.find((owner) => owner.matches(':focus-within'));
  const first = candidates[0];
  const session = first && inputs.get(first).getSession?.();
  const sameSession = session && candidates.every((owner) => (
    inputs.get(owner).getSession?.() === session
  ));
  const owner = focused || (candidates.length === 1 || sameSession ? first : null);
  if (!owner) return;
  const callbacks = inputs.get(owner);
  if (event.type === CHAT_EVENT.SET_PROMPT) callbacks.onPrompt(detail);
  else callbacks.onContext(detail);
}

export function subscribeChatEvents(owner, callbacks) {
  if (!inputs.size) {
    document.addEventListener(CHAT_EVENT.SET_PROMPT, routeEvent);
    document.addEventListener(CHAT_EVENT.ADD_TO_CHAT, routeEvent);
  }
  inputs.set(owner, callbacks);
  return () => {
    inputs.delete(owner);
    if (inputs.size) return;
    document.removeEventListener(CHAT_EVENT.SET_PROMPT, routeEvent);
    document.removeEventListener(CHAT_EVENT.ADD_TO_CHAT, routeEvent);
  };
}
