import { AGENT_EVENT as EVENT } from './constants.js';
import { loadHrefSvg } from '../../utils/svg.js';

const ICONS_PREFIX = new URL('../../img/icons/', import.meta.url).href;

export async function loadChatIcons(iconMap) {
  const entries = Object.entries(iconMap);
  const svgs = await Promise.all(
    entries.map(([, name]) => loadHrefSvg(`${ICONS_PREFIX}S2_Icon_${name}_20_N.svg`)),
  );
  return Object.fromEntries(entries.map(([key], i) => [key, svgs[i]]));
}

function processEvent(event, streaming, callbacks) {
  const { onDelta, onText, onTool } = callbacks;
  if (event.type === EVENT.ERROR) {
    throw new Error(event.errorText ?? event.error?.message ?? 'Agent error');
  }

  if (event.type === EVENT.FINISH_MESSAGE || event.type === EVENT.FINISH) {
    return { streaming, done: true };
  }
  if (event.type === EVENT.TEXT_END) {
    if (streaming) onText(streaming);
    return { streaming: '', done: false };
  }
  if (event.type === EVENT.TEXT_DELTA) {
    const next = streaming + (event.delta ?? event.textDelta ?? event.text ?? '');
    onDelta(next);
    return { streaming: next, done: false };
  }

  if (event.type === EVENT.TOOL_CALL || event.type === EVENT.TOOL_CALL_LEGACY) {
    onTool?.({
      type: EVENT.TOOL_CALL,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: event.input ?? event.args ?? {},
    });
  } else if (event.type === EVENT.TOOL_APPROVAL_REQUEST) {
    onTool?.({
      type: EVENT.TOOL_APPROVAL_REQUEST,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      approvalId: event.approvalId,
      input: event.input ?? event.args ?? {},
    });
  } else if (event.type === EVENT.TOOL_RESULT || event.type === EVENT.TOOL_RESULT_LEGACY) {
    const raw = event.output ?? event.result;
    const isError = raw && typeof raw === 'object' && 'error' in raw;
    onTool?.({
      type: EVENT.TOOL_RESULT,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      output: raw,
      isError,
    });
  }

  return { streaming, done: false };
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function readStream(body, callbacks) {
  const decoder = new TextDecoder();
  let buffer = '';
  let streaming = '';
  let finished = false;

  for await (const chunk of body) {
    if (finished) break;
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const raw = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();
      if (raw && raw !== '[DONE]') {
        let event;
        try {
          event = JSON.parse(raw);
        } catch {
          event = null;
        }
        if (event) {
          ({ streaming, done: finished } = processEvent(event, streaming, callbacks));
        }
      }
    }
  }

  if (streaming) callbacks.onText(streaming);
}
