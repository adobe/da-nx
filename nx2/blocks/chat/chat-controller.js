import { loadIms } from '../../utils/ims.js';
import { hashChange } from '../../utils/utils.js';

const AGENT_URL = 'https://da-agent.adobeaem.workers.dev/chat';

export default class ChatController {
  constructor({ onUpdate }) {
    this._onUpdate = onUpdate;
    this._unsubscribe = hashChange.subscribe((state) => { this._context = state; });
  }

  get state() {
    return { messages: this._messages, thinking: this._thinking };
  }

  _update() {
    this._onUpdate(this.state);
  }

  _done() {
    this._abortController = null;
    this._thinking = false;
    this._update();
  }

  stop() {
    this._abortController?.abort();
    this._done();
  }

  destroy() {
    this._unsubscribe?.();
    this.stop();
  }

  _processEvent(event, streaming) {
    if (event.type === 'text-delta') {
      return { streaming: streaming + (event.delta ?? event.textDelta ?? event.text ?? ''), done: false };
    }
    if (event.type === 'text-end') {
      if (streaming) {
        this._messages = [...this._messages, { role: 'assistant', content: streaming }];
        this._update();
      }
      return { streaming: '', done: false };
    }
    if (event.type === 'finish-message' || event.type === 'finish') {
      return { streaming, done: true };
    }
    if (event.type === 'error') {
      throw new Error(event.errorText ?? event.error?.message ?? 'Agent error');
    }
    return { streaming, done: false };
  }

  async _readStream(body) {
    const decoder = new TextDecoder();
    let buffer = '';
    let streaming = '';
    let finished = false;

    for await (const chunk of body) {
      if (finished) break;
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

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
            const result = this._processEvent(event, streaming);
            streaming = result.streaming;
            finished = result.done;
          }
        }
      }
    }

    if (streaming) {
      this._messages = [...this._messages, { role: 'assistant', content: streaming }];
      this._update();
    }
  }

  async _post(body) {
    const { accessToken } = await loadIms();
    this._abortController = new AbortController();
    const resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, imsToken: accessToken?.token, room: 'default' }),
      signal: this._abortController.signal,
    });
    if (!resp.ok) throw new Error(`Agent responded with ${resp.status}`);
    return resp;
  }

  async sendMessage(message) {
    if (this._thinking) return;

    this._messages = [...(this._messages ?? []), { role: 'user', content: message }];
    this._thinking = true;
    this._update();

    try {
      const resp = await this._post({ messages: this._messages, pageContext: this._context });
      await this._readStream(resp.body);
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._messages = [...(this._messages ?? []), { role: 'assistant', content: `Error: ${err.message}` }];
      }
    } finally {
      this._done();
    }
  }
}
