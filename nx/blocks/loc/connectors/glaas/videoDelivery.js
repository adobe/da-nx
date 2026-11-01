import { getV2Asset, waitForGlaasDelay } from './multimodalApi.js';
import { SOURCE_CAPTION_LOCALE } from './videoPayload.js';
import { shouldLogGLaaSRequests } from './api.js';

const DELIVERY_HREF = 'https://14257-dalocv2-stage.adobeioruntime.net/api/v1/web/daloc/video-delivery';
// Allow one minute-based scheduler cycle before asking the author to refresh.
const DELIVERY_WAIT_MS = 75_000;
const DELIVERY_POLL_MS = 3000;

function logVideoDelivery(step, detail) {
  if (!shouldLogGLaaSRequests()) return;
  // eslint-disable-next-line no-console -- opt-in diagnostics exclude credentials and signed URLs
  console.info('[GLaaS]', step, detail);
}

function pendingVideos(langs) {
  const sources = new Set();
  const sharedTasks = new Map();
  langs.forEach((lang) => {
    Object.entries(lang.translation?.workflowTasks ?? {}).forEach(([taskName, task]) => {
      const key = JSON.stringify([task.workflow, taskName]);
      if (!sharedTasks.has(key)) sharedTasks.set(key, []);
      sharedTasks.get(key).push(task);
    });
  });
  return langs.flatMap((lang) => {
    if (lang.translation?.status === 'cancelled') return [];
    return Object.entries(lang.translation?.workflowTasks ?? {}).flatMap(([taskName, task]) => {
      if (task.workflowName !== 'MULTIMODAL' || task.status?.status === 'cancelled') return [];
      const videos = new Map(Object.values(task.pageAssets ?? {}).flatMap((page) => (
        (page.videos ?? []).map((video) => [video.glaasName, video])
      )));
      return [...videos].flatMap(([assetName, video]) => {
        const sourceKey = JSON.stringify([task.workflow, taskName, assetName]);
        const copies = sharedTasks.get(JSON.stringify([task.workflow, taskName]));
        const deliveredSource = copies.find((copy) => (
          copy.sourceCaptionDelivery?.[assetName]?.status === 'delivered'
        ));
        if (deliveredSource) {
          const sourceDelivery = deliveredSource.sourceCaptionDelivery[assetName];
          copies.forEach((copy) => {
            copy.sourceCaptionDelivery ??= {};
            copy.sourceCaptionDelivery[assetName] = sourceDelivery;
          });
        }
        const codes = lang.code === SOURCE_CAPTION_LOCALE ? [] : [lang.code];
        if (!sources.has(sourceKey)) {
          codes.push(SOURCE_CAPTION_LOCALE);
          sources.add(sourceKey);
        }
        return codes.filter((code) => {
          const delivery = code === SOURCE_CAPTION_LOCALE
            ? task.sourceCaptionDelivery : task.videoDelivery;
          return delivery?.[assetName]?.status !== 'delivered';
        }).map((code) => ({
          task, taskName, assetName, video, code, copies,
        }));
      });
    });
  });
}

export function hasPendingVideoCaptions(task, code) {
  return Object.values(task.pageAssets ?? {}).some((page) => (
    (page.videos ?? []).some(({ glaasName }) => (
      (code === SOURCE_CAPTION_LOCALE
        ? task.sourceCaptionDelivery : task.videoDelivery)?.[glaasName]?.status !== 'delivered'
      || (code !== SOURCE_CAPTION_LOCALE
        && task.sourceCaptionDelivery?.[glaasName]?.status !== 'delivered')
    ))
  ));
}

async function requestDelivery({ item, body, signal, statusOnly = false }) {
  const accessToken = window.adobeIMS?.getAccessToken()?.token;
  if (!accessToken) throw new Error('Sign in to Adobe before delivering video captions.');
  logVideoDelivery('video-delivery-request', { ...body, statusOnly });
  const resp = await fetch(DELIVERY_HREF, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ ...body, ...(statusOnly && { statusOnly }) }),
    signal,
  });
  const delivery = await resp.json().catch(() => null);
  signal?.throwIfAborted();
  logVideoDelivery('video-delivery-result', {
    taskName: body.taskName,
    assetName: body.assetName,
    targetLocale: body.targetLocale,
    httpStatus: resp.status,
    status: delivery?.status,
  });
  if (!resp.ok || !['queued', 'uploading', 'delivered', 'error'].includes(delivery?.status)) {
    throw new Error(`Could not check video delivery for ${body.assetName} (${body.targetLocale}): ${delivery?.error || `HTTP ${resp.status}`}.`);
  }
  const { task, code, copies, assetName } = item;
  const deliveryKey = code === SOURCE_CAPTION_LOCALE ? 'sourceCaptionDelivery' : 'videoDelivery';
  const owners = code === SOURCE_CAPTION_LOCALE ? copies : [task];
  owners.forEach((owner) => {
    owner[deliveryKey] ??= {};
    owner[deliveryKey][assetName] = {
      status: delivery.status,
      ...(body.taskVersion !== undefined && { taskVersion: body.taskVersion }),
    };
  });
  if (delivery.status === 'error') {
    throw new Error(`Video delivery failed for ${assetName} (${code}): ${delivery.error || 'Delivery requires review.'}`);
  }
  return delivery.status;
}

export default async function deliverVideos({
  service, token, langs, signal, onProgress, saveState,
}) {
  const pending = pendingVideos(langs);
  if (!pending.length) return undefined;
  const accessToken = window.adobeIMS?.getAccessToken()?.token;
  if (!accessToken) throw new Error('Sign in to Adobe before delivering video captions.');
  const queued = [];
  const failures = [];
  let awaitingTranslation = false;
  try {
    for (const item of pending) {
      try {
        const {
          task, taskName, assetName, video, code,
        } = item;
        signal?.throwIfAborted();
        const videoTask = { ...task, name: taskName, code };
        const identity = { taskName, assetName, targetLocale: code };
        logVideoDelivery('video-caption-check', identity);
        const previous = (code === SOURCE_CAPTION_LOCALE
          ? task.sourceCaptionDelivery : task.videoDelivery)?.[assetName];
        const alreadyQueued = ['queued', 'uploading'].includes(previous?.status);
        const meta = alreadyQueued
          ? { status: 200, json: { taskVersion: previous.taskVersion } }
          : await getV2Asset(service, token, videoTask, assetName, { signal });
        const references = Array.isArray(meta.json?.referencedAssets)
          ? meta.json.referencedAssets : [];
        const signedURL = meta.json?.signedURL
      || references.find((asset) => asset?.assetType === 'SRT' && asset.signedURL)?.signedURL;
        const ready = alreadyQueued || (meta.status === 200 && Boolean(signedURL));
        logVideoDelivery('video-caption-result', {
          ...identity,
          httpStatus: meta.status,
          responseShape: Array.isArray(meta.json) ? 'array' : typeof meta.json,
          responseKeys: meta.json && typeof meta.json === 'object' ? Object.keys(meta.json) : [],
          hasSignedURL: Boolean(signedURL),
          ready,
        });
        if (meta.error || (meta.status >= 400 && meta.status !== 404)) {
          throw new Error(`Could not check video captions for ${assetName} (${code}): ${meta.error || `HTTP ${meta.status}`}.`);
        }
        if (!ready) {
          awaitingTranslation = true;
        } else {
          const [productName, projectName] = task.workflow.split('/');
          const body = {
            productName,
            projectName,
            taskName,
            assetName,
            targetLocale: code,
            videoId: video.videoId,
            taskVersion: meta.json?.taskVersion,
          };
          const status = await requestDelivery({ item, body, signal, statusOnly: alreadyQueued });
          if (status !== 'delivered') queued.push({ item, body });
        }
      } catch (error) {
        signal?.throwIfAborted();
        failures.push(error.message);
      }
    }
  } finally {
    await saveState?.();
  }
  if (queued.length) {
    onProgress?.({ text: 'Preparing video captions...' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_WAIT_MS);
    const pollingSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      while (queued.length) {
        await waitForGlaasDelay(DELIVERY_POLL_MS, pollingSignal);
        let changed = false;
        for (const entry of [...queued]) {
          try {
            const { item } = entry;
            const priorStatus = (item.code === SOURCE_CAPTION_LOCALE
              ? item.task.sourceCaptionDelivery : item.task.videoDelivery)[item.assetName].status;
            const status = await requestDelivery({
              ...entry, signal: pollingSignal, statusOnly: true,
            });
            changed ||= status !== priorStatus;
            if (status === 'delivered') queued.splice(queued.indexOf(entry), 1);
          } catch (error) {
            pollingSignal.throwIfAborted();
            failures.push(error.message);
            queued.splice(queued.indexOf(entry), 1);
            changed = true;
          }
        }
        if (changed) await saveState?.();
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (!controller.signal.aborted) throw error;
    } finally {
      clearTimeout(timeout);
      await saveState?.();
    }
  }
  if (failures.length) throw new Error(failures.join(' '));
  return awaitingTranslation || queued.length ? {
    type: 'info',
    text: awaitingTranslation
      ? 'Video captions are still translating. Click Get Status again shortly to refresh.'
      : 'Video captions are still processing. Click Get Status again shortly to refresh.',
  } : undefined;
}
