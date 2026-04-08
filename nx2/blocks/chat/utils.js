export function processEvent(event, streaming, onDelta, onText) {
  if (event.type === 'error') {
    throw new Error(event.errorText ?? event.error?.message ?? 'Agent error');
  }
  if (event.type === 'finish-message' || event.type === 'finish') {
    return { streaming, done: true };
  }
  if (event.type === 'text-delta') {
    const next = streaming + (event.delta ?? event.textDelta ?? event.text ?? '');
    onDelta(next);
    return { streaming: next, done: false };
  }
  if (event.type === 'text-end') {
    if (streaming) onText(streaming);
    return { streaming: '', done: false };
  }
  return { streaming, done: false };
}

export async function readStream(body, onDelta, onText) {
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
          ({ streaming, done: finished } = processEvent(event, streaming, onDelta, onText));
        }
      }
    }
  }

  if (streaming) onText(streaming);
}
