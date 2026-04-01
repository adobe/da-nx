export default class ChatController {
  constructor({ onUpdate }) {
    this._onUpdate = onUpdate;
  }

  get state() {
    return { messages: this._messages, thinking: this._thinking };
  }

  _update() {
    this._onUpdate(this.state);
  }

  // TODO: replace stub with real agent call
  async sendMessage(message) {
    this._messages = [...(this._messages ?? []), { role: 'user', content: message }];
    this._thinking = true;
    this._update();

    await new Promise((resolve) => { setTimeout(resolve, 1200); });

    this._messages = [...this._messages, { role: 'assistant', content: `Echo: ${message}` }];
    this._thinking = false;
    this._update();
  }
}
