import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx2/scripts/nx.js';
import { CHAT_EVENT } from '../../../../nx2/utils/chat.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';

await setConfig({ hostnames: [] });
await import('../../../../nx2/blocks/chat-ao/input.js');

describe('standalone AO input', () => {
  let chatInput;
  let input;
  let sent;

  beforeEach(async () => {
    chatInput = document.createElement('nx-ao-input');
    sent = [];
    chatInput.onSubmit = (payload) => sent.push(payload);
    document.body.append(chatInput);
    await chatInput.updateComplete;
    input = chatInput.shadowRoot.querySelector('.chat-input');
  });

  afterEach(() => chatInput.remove());

  it('edits a draft, focuses through its public API, and splits the submit payload', async () => {
    const context = { id: 'selection', label: 'Selection', type: 'text' };
    const attachment = { id: 'file', label: 'File', dataBase64: 'ZmlsZQ==' };
    chatInput.addItem(context);
    chatInput.addItem(attachment);
    await chatInput.setPrompt(' first ');
    expect(chatInput.draft).to.equal(' first ');
    expect(chatInput.shadowRoot.activeElement).to.equal(input);
    input.value = ' edited ';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(sent).to.deep.equal([{ text: 'edited', context: [context], attachments: [attachment] }]);
    expect(chatInput.draft).to.equal('');
    expect(chatInput.items).to.deep.equal([]);
  });

  it('leaves Shift+Enter to native editing and ignores blank submissions', async () => {
    await chatInput.setPrompt('line one');
    const newline = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true });
    input.dispatchEvent(newline);
    expect(newline.defaultPrevented).to.be.false;
    expect(sent).to.have.length(0);
    await chatInput.setPrompt('   ', { autoSend: true });
    expect(sent).to.have.length(0);
  });

  it('preserves the draft and pills when blocked and stops exactly once', async () => {
    await chatInput.setPrompt('draft');
    chatInput.addItem({ id: 'context', label: 'Context' });
    chatInput.blocked = true;
    let stopped = 0;
    chatInput.onStop = () => { stopped += 1; };
    await chatInput.updateComplete;
    expect(input.disabled).to.be.true;
    await chatInput.setPrompt('replacement', { autoSend: true });
    chatInput.shadowRoot.querySelector('.chat-stop').click();
    expect(stopped).to.equal(1);
    expect(sent).to.have.length(0);
    expect(chatInput.draft).to.equal('draft');
    expect(chatInput.items).to.have.length(1);
  });

  it('submits a slash-selected skill through the same payload boundary', async () => {
    chatInput.getSkills = () => ['writeBlog'];
    chatInput.addItem({ id: 'context', label: 'Context' });
    await chatInput.setPrompt('/w');
    input.dispatchEvent(new Event('input'));
    const menu = chatInput.shadowRoot.querySelector('.slash-menu');
    await menu.updateComplete;
    expect(menu.items.map((item) => item.id).filter(Boolean)).to.deep.equal(['writeBlog']);
    menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'writeBlog' } }));
    expect(sent).to.have.length(1);
    expect(sent[0].text).to.include('/writeBlog');
    expect(sent[0].context[0].id).to.equal('context');
    expect(sent[0].attachments).to.deep.equal([]);
    expect(chatInput.draft).to.equal('');
    expect(chatInput.items).to.deep.equal([]);
  });

  it('lets the slash menu consume navigation, Escape, and Enter before form submission', async () => {
    chatInput.getSkills = () => ['writeBlog'];
    await chatInput.setPrompt('/');
    input.dispatchEvent(new Event('input'));
    const menu = chatInput.shadowRoot.querySelector('.slash-menu');
    const keys = [];
    menu.handleKey = (key) => keys.push(key);
    ['ArrowDown', 'ArrowUp', 'Escape', 'Enter'].forEach((key) => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    });
    expect(keys).to.deep.equal(['ArrowDown', 'ArrowUp', 'Escape', 'Enter']);
    expect(sent).to.have.length(0);
  });

  it('uses the chooser without auto-sending and forwards only parent-owned menu actions', async () => {
    chatInput.prompts = [{ title: 'Example', prompt: 'Try this' }];
    const actions = [];
    chatInput.onMenuSelect = (id) => actions.push(id);
    await chatInput.updateComplete;
    const menus = chatInput.shadowRoot.querySelectorAll('nx-menu');
    const addMenu = menus[1];
    addMenu.dispatchEvent(new CustomEvent('select', { detail: { id: MENU_OPTIONS.MANAGE_PROMPT } }));
    expect(actions).to.deep.equal([MENU_OPTIONS.MANAGE_PROMPT]);
    chatInput.openPrompts();
    chatInput.shadowRoot.querySelector('nx-prompts').onSend('Chosen prompt');
    await chatInput.updateComplete;
    expect(chatInput.draft).to.equal('Chosen prompt');
    expect(sent).to.have.length(0);
    expect(chatInput.shadowRoot.querySelector('.prompts-popover').open).to.be.false;
  });

  it('does not subscribe to document prompt events or add-context events by default', async () => {
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
      detail: { text: 'Do not send', autoSend: true },
    }));
    expect(chatInput.draft).to.equal('');
    expect(sent).to.have.length(0);
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, {
      detail: { id: 'unowned-context', label: 'Ignored' },
    }));
    expect(chatInput.items).to.deep.equal([]);
  });

  it('keeps self-managed pill removal and revokes remaining thumbnails on disconnect', () => {
    const revoke = URL.revokeObjectURL;
    const revoked = [];
    URL.revokeObjectURL = (href) => revoked.push(href);
    try {
      chatInput.addItem({ id: 'first', label: 'First', thumbnail: 'blob:first' });
      chatInput.addItem({ id: 'second', label: 'Second', thumbnail: 'blob:second' });
      chatInput.shadowRoot.querySelector('nx-pills')._remove('first');
      expect(chatInput.items.map((item) => item.id)).to.deep.equal(['second']);
      chatInput.remove();
      expect(revoked).to.deep.equal(['blob:first', 'blob:second']);
    } finally {
      URL.revokeObjectURL = revoke;
    }
  });

  it('opens the file picker, reads attachments, rejects oversized files, and resets the picker', async () => {
    const picker = chatInput.shadowRoot.querySelector('.chat-file-input');
    let clicked = false;
    picker.click = () => { clicked = true; };
    chatInput.shadowRoot.querySelectorAll('nx-menu')[1].dispatchEvent(new CustomEvent('select', {
      detail: { id: 'files' },
    }));
    expect(clicked).to.be.true;
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const large = new File(['big'], 'large.txt', { type: 'text/plain' });
    Object.defineProperty(large, 'size', { value: 101 * 1024 * 1024 });
    const target = { files: [file, large], value: 'selected' };
    await chatInput._onFileInputChange({ target });
    expect(target.value).to.equal('');
    expect(chatInput.items.map((item) => item.fileName)).to.deep.equal(['notes.txt']);
    await chatInput.setPrompt('Read this', { autoSend: true });
    expect(sent[0].attachments[0].dataBase64).to.equal(btoa('hello'));
  });

  it('filters dropped extensions and clears dragging state', async () => {
    const form = chatInput.shadowRoot.querySelector('form');
    form.dispatchEvent(new Event('dragenter', { cancelable: true }));
    await chatInput.updateComplete;
    expect(chatInput.shadowRoot.querySelector('.chat-drop-zone')).not.to.equal(null);
    await chatInput._dnd.onDrop({
      preventDefault() {},
      dataTransfer: { files: [new File(['ok'], 'allowed.txt'), new File(['no'], 'bad.exe')] },
    });
    await chatInput.updateComplete;
    expect(chatInput.items.map((item) => item.fileName)).to.deep.equal(['allowed.txt']);
    expect(chatInput.shadowRoot.querySelector('.chat-drop-zone')).to.equal(null);
  });

  it('replaces interim voice chunks, focuses final text, and stops recognition on disconnect', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'SpeechRecognition');
    const brandsDescriptor = Object.getOwnPropertyDescriptor(navigator, 'userAgentData');
    let recognition;
    let stopped = false;
    class Recognition {
      constructor() { recognition = this; }

      start() { this.onstart(); }

      stop() { stopped = true; }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition });
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined });
    chatInput.remove();
    document.body.append(chatInput);
    chatInput.requestUpdate();
    await chatInput.updateComplete;
    try {
      await chatInput.setPrompt('Existing');
      chatInput.shadowRoot.querySelector('.chat-voice').click();
      const result = (text, isFinal) => {
        const row = [{ transcript: text }];
        row.isFinal = isFinal;
        recognition.onresult({ resultIndex: 0, results: [row] });
      };
      result('working', false);
      result('finished', true);
      expect(chatInput.draft).to.equal('Existing finished');
      expect(chatInput.shadowRoot.activeElement).to.equal(input);
      chatInput.remove();
      expect(stopped).to.be.true;
      expect(recognition.onresult).to.equal(null);
      expect(chatInput._voiceListening).to.be.false;
    } finally {
      if (descriptor) Object.defineProperty(window, 'SpeechRecognition', descriptor);
      else delete window.SpeechRecognition;
      if (brandsDescriptor) Object.defineProperty(navigator, 'userAgentData', brandsDescriptor);
      else delete navigator.userAgentData;
    }
  });
});
