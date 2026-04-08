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
    this._room = null;
  }

  async _getRoom() {
    if (this._room) return this._room;
    const { userId } = await loadIms();
    const { org, site } = this._context ?? {};
    this._room = org && site && userId ? `${org}--${site}--${userId}` : 'default';
    return this._room;
  }

  async loadInitialMessages() {
    this._messages = [];
    this._update();
  }

  _update() {
    const {
      _messages: messages, _thinking: thinking,
      _streamingText: streamingText, _connected: connected,
    } = this;
    this._onUpdate({ messages, thinking, streamingText, connected });
  }

  async connect(attempt = 0) {
    try {
      await fetch(AGENT_URL, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      this._connected = true;
      this._update();
    } catch {
      this._connected = false;
      this._update();
      const delay = 1000 * 2 ** attempt;
      if (delay >= 30000) return;
      this._retryTimeout = setTimeout(() => this.connect(attempt + 1), delay);
    }
  }

  _done() {
    this._abortController = null;
    this._thinking = false;
    this._update();
    this._streamingText = undefined;
  }

  stop() {
    this._abortController?.abort();
    this._done();
  }

  async clear() {
    if (this._thinking) this.stop();
    this._messages = undefined;
    this._streamingText = undefined;
    this._update();
    // const room = await this._getRoom();
    // clearMessages(room);
  }

  destroy() {
    clearTimeout(this._retryTimeout);
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
    if (this._thinking || !this._connected) return;

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
