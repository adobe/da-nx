import { loadIms } from '../../utils/ims.js';
import { readStream } from './utils.js';

const isLocal = new URLSearchParams(window.location.search).get('ref') === 'local';
const AGENT_URL = isLocal ? 'http://localhost:5173/chat' : 'https://da-agent.adobeaem.workers.dev/chat';

export default class ChatController {
  constructor({ onUpdate }) {
    this._onUpdate = onUpdate;
  }

  setContext(context) {
    this._context = context;
  }

  _update() {
    const { _messages: messages, _thinking: thinking, _streamingText: streamingText } = this;
    this._onUpdate({ messages, thinking, streamingText });
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
    this.stop();
  }

  async _post(body) {
    const { accessToken } = await loadIms();

    this._abortController = new AbortController();

    const resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, imsToken: accessToken?.token ?? null, room: 'default' }),
      signal: this._abortController.signal,
    });

    if (!resp.ok) {
      throw new Error(`Agent responded with ${resp.status}: ${await resp.text()}`);
    }

    return resp;
  }

  async sendMessage(message) {
    if (this._thinking) return;

    this._messages = [...(this._messages ?? []), { role: 'user', content: message }];
    this._thinking = true;
    this._update();

    try {
      const { org, site, path, view } = this._context ?? {};
      const pageContext = org && site ? { org, site, path, view } : undefined;
      const resp = await this._post({ messages: this._messages, pageContext });

      await readStream(
        resp.body,
        (next) => { this._streamingText = next; this._update(); },
        (text) => {
          this._messages = [...this._messages, { role: 'assistant', content: text }];
          this._streamingText = '';
          this._update();
        },
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._messages = [
          ...(this._messages ?? []),
          { role: 'assistant', content: `Error: ${err.message}` },
        ];
      }
    } finally {
      this._done();
    }
  }
}
