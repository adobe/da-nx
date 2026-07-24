import { AGENT_EVENT as EVENT, TOOL_SCOPE } from '../constants.js';

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

  if (event.type === EVENT.TOOL_INPUT_AVAILABLE) {
    onTool?.({
      type: EVENT.TOOL_INPUT_AVAILABLE,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: event.input ?? event.args ?? {},
    });
  } else if (event.type === EVENT.TOOL_APPROVAL_REQUEST) {
    onTool?.({
      type: EVENT.TOOL_APPROVAL_REQUEST,
      toolCallId: event.toolCallId,
    });
  } else if (event.type === EVENT.TOOL_OUTPUT_AVAILABLE) {
    const raw = event.output ?? event.result;
    const isError = raw && typeof raw === 'object' && 'error' in raw;
    onTool?.({
      type: isError ? EVENT.TOOL_OUTPUT_ERROR : EVENT.TOOL_OUTPUT_AVAILABLE,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      output: raw,
      isError,
      scope: !isError ? TOOL_SCOPE[event.toolName] : undefined,
    });
  } else if (event.type === EVENT.TOOL_OUTPUT_ERROR) {
    onTool?.({
      type: EVENT.TOOL_OUTPUT_ERROR,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      errorText: event.errorText ?? event.error?.message,
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
