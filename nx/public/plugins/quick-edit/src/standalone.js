import { MESSAGE_TYPES } from '../../../../utils/message-types.js';

export function isStandaloneShell(href) {
  const url = new URL(href);
  return url.origin.endsWith('.aem.page')
    && url.searchParams.get('controller') !== 'parent';
}

export function getQuickEditPortalSrc(href, { bootstrap = false } = {}) {
  const url = new URL(href);
  const ref = url.searchParams.get('quick-edit');
  const portalUrl = new URL(!ref || ref === 'on'
    ? 'https://da.live/plugins/quick-edit'
    : 'https://main--da-live--adobe.aem.live/plugins/quick-edit');
  if (ref && ref !== 'on') portalUrl.searchParams.set('nx', ref);
  if (bootstrap) portalUrl.searchParams.set('controller', 'bootstrap');
  return portalUrl.href;
}

export function getQuickEditPreviewSrc(href) {
  const url = new URL(href);
  url.hostname = url.hostname.replace(/\.aem\.page$/, '.preview.da.live');
  if (!url.searchParams.has('quick-edit')) url.searchParams.set('quick-edit', 'on');
  url.searchParams.set('controller', 'parent');
  return url.href;
}

export function getStandaloneConfig(config) {
  return {
    ...config,
    canWrite: config?.canWrite ?? true,
  };
}

function flushControllerQueue(ctx) {
  if (!ctx.initialized || !ctx.port) return;
  ctx.queue.splice(0).forEach((data) => ctx.port.postMessage(data));
}

export function relayControllerMessage({ data, source, target }) {
  if (data?.type === MESSAGE_TYPES.READY) source.initialized = true;

  if (target.initialized && target.port) {
    target.port.postMessage(data);
  } else {
    target.queue.push(data);
  }

  flushControllerQueue(source);
}
