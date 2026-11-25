import CoworkerChatController from './coworker-chat-controller.js';
import CmaChatController from './cma-chat-controller.js';
import { CHAT_EVENT } from '../../utils/chat.js';
import { traceChat } from '../shared/chat/turn-activity.js';

const sessions = new Map();
const inputs = new Map();

export function getSessionScope({ org, site, harness }) {
  return JSON.stringify([org, site, harness]);
}

export function getAoSession({
  context, owner, isolated = false, harness = 'coworker',
}) {
  traceChat('session.js.getAoSession: looking for reusable session', { harness, isolated });
  const { org, site } = context;
  const scope = getSessionScope({ org, site, harness });
  // Only non-isolated sessions count as reuse candidates; an isolated sibling
  // in the same scope must not force an unrelated request into isolation.
  const matching = [...sessions.keys()].filter(
    (session) => session.scope === scope && !session.isolated,
  );
  const available = !isolated && matching.find((session) => (
    ![...sessions.get(session).keys()].some((view) => view.localName === owner.localName)
  ));
  if (available) {
    traceChat('session.js.getAoSession: reusing session');
    return available;
  }
  traceChat('session.js.getAoSession: creating session');

  const subscribers = new Map();
  let state = { messages: [], loadingEpisode: true };
  let initialized = false;
  let initializing = false;
  let startupFailed = false;
  let destroyed = false;
  let sending = false;
  const notify = () => {
    traceChat('session.js.notify: sending state to subscribed views', { subscriberCount: subscribers.size });
    subscribers.forEach(({ onUpdate }) => onUpdate(state));
  };
  const publish = (next) => {
    traceChat('session.js.publish: received controller state', { destroyed });
    if (destroyed) return;
    state = next;
    if (!state.thinking) sending = false;
    notify();
  };
  const relay = (name) => (detail) => {
    traceChat('session.js.relay: forwarding lifecycle callback to subscribed views', {
      callback: name,
      subscriberCount: subscribers.size,
      sessionId: detail?.sessionId,
      turnId: detail?.turnId,
    });
    subscribers.forEach((callbacks) => callbacks[name]?.(detail));
  };
  const Controller = harness === 'cma' ? CmaChatController : CoworkerChatController;
  traceChat('session.js.getAoSession: constructing harness controller', { controller: Controller.name });
  const controller = new Controller({
    onUpdate: publish,
    onTurnStarted: relay('onTurnStarted'),
    onTurnProgress: relay('onTurnProgress'),
    onTurnCompleted: relay('onTurnCompleted'),
    isolated: isolated || matching.length > 0,
  });
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && initialized) controller.reattachIfIdle?.();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const initialize = async () => {
    if (destroyed || initialized || initializing) return;
    initializing = true;
    try {
      controller.setContext(context);
      if (controller.checkAccess) {
        const allowed = await controller.checkAccess();
        if (!allowed) {
          startupFailed = true;
          publish({ ...state, loadingEpisode: false });
          return;
        }
      }
      if (destroyed) return;
      await Promise.all([controller.loadEpisodes(), controller.loadSkills()]);
      if (destroyed) return;
      initialized = true;
      notify();
    } catch (error) {
      startupFailed = true;
      publish({
        messages: [{ role: 'assistant', content: `Error: ${error.message}` }],
        thinking: false,
        loadingEpisode: false,
      });
    } finally {
      initializing = false;
    }
  };

  const session = {
    scope,
    isolated,
    controller,
    ready: Promise.resolve().then(initialize),
    retryAccess() {
      if (destroyed || initializing || initialized || state.access?.status !== 'error') return session.ready;
      session.ready = initialize();
      return session.ready;
    },
    subscribe(view, callbacks) {
      traceChat('session.js.subscribe: registering view callbacks', { view: view.localName });
      subscribers.set(view, callbacks);
      notify();
      return () => {
        traceChat('session.js.unsubscribe: removing view callbacks', { view: view.localName });
        subscribers.delete(view);
        if (subscribers.size || destroyed) return;
        destroyed = true;
        sessions.delete(session);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        controller.destroy();
      };
    },
    canSend() {
      return !destroyed && initialized && !sending && !state.loadingEpisode
        && !(state.thinking && !state.pendingPlanApproval);
    },
    canQueueAutoSend({ includeReady = false } = {}) {
      return !destroyed && (!initialized || includeReady) && !startupFailed
        && !['denied', 'error'].includes(state.access?.status);
    },
    send({ context: currentContext, args }) {
      traceChat('session.js.send: checking shared-session readiness');
      if (!session.canSend()) {
        traceChat('session.js.send: skipped; session not ready or busy');
        return false;
      }
      controller.setContext(currentContext);
      sending = true;
      try {
        traceChat('session.js.send: calling harness controller.sendMessage');
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
