import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx2/scripts/nx.js';
import { CHAT_EVENT } from '../../../../nx2/utils/chat.js';

await setConfig({ hostnames: [] });
await import('../../../../nx2/blocks/chat-ao/chat-ao.js');

describe('chat AO input', () => {
  let chat;
  let input;
  let chatInput;
  let sent;
  let stopped;
  let warmed;
  let originalFetch;

  beforeEach(async () => {
    originalFetch = window.fetch;
    window.fetch = (resource, options) => {
      if (String(resource).includes('/api/v1/overrides/user/resolved')) {
        return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
      }
      return originalFetch(resource, options);
    };
    chat = document.createElement('nx-chat-ao');
    chat._explicitContext = true;
    sent = [];
    stopped = 0;
    warmed = 0;
    chat._controller = {
      destroy() {},
      reattachIfIdle() {},
      getSkills: () => [{ name: 'writeBlog' }],
      sendMessage: (...args) => sent.push(args),
      stop: () => { stopped += 1; },
      warmSession: () => { warmed += 1; },
    };
    chat.messages = [{ role: 'user', content: 'Hello' }];
    document.body.append(chat);
    await chat.updateComplete;
    chatInput = chat.shadowRoot.querySelector('nx-ao-input');
    await chatInput.updateComplete;
    input = chatInput.shadowRoot.querySelector('.chat-input');
  });

  afterEach(() => {
    chat.remove();
    window.fetch = originalFetch;
  });

  it('disables input while thinking and enables it when thinking stops', async () => {
    expect(input.disabled).to.be.false;
    chat.thinking = true;
    await chat.updateComplete;
    await chatInput.updateComplete;
    expect(input.disabled).to.be.true;
    chatInput.shadowRoot.querySelector('.chat-stop').focus();
    chat.thinking = false;
    await chat.updateComplete;
    await chatInput.updateComplete;
    expect(input.disabled).to.be.false;
    expect(chatInput.shadowRoot.activeElement).to.equal(input);
  });

  it('renders tool approval inline like a pending question and delegates decisions', async () => {
    const decisions = [];
    chat._controller.respondToPermission = (...args) => decisions.push(args);
    chat.thinking = true;
    chat.pendingPermission = {
      calls: [{
        toolCallId: 'tc1',
        toolName: 'governance__bga_create_brand_context_rule',
        arguments: '{"name":"No green bananas"}',
      }],
      decisions: {},
    };
    await chat.updateComplete;

    const card = chat.shadowRoot.querySelector('.permission-card');
    expect(card.closest('.chat-messages-container')).to.not.equal(null);
    expect(card.closest('.message-assistant')).to.not.equal(null);
    expect(chat.shadowRoot.querySelector('.chat-form-wrap .permission-card')).to.equal(null);
    expect(card.nextElementSibling.textContent).to.equal('Waiting for your approval...');
    expect(chat.shadowRoot.querySelector('.chat-thinking')).to.equal(null);
    expect(getComputedStyle(card).position).to.equal('static');
    expect(getComputedStyle(card).boxShadow).to.equal('none');
    expect(chat.shadowRoot.activeElement).to.equal(card.querySelector('.permission-approve-btn'));
    card.querySelector('.permission-approve-btn').click();
    expect(decisions).to.deep.equal([['tc1', true]]);

    chat.pendingPermission = undefined;
    await chat.updateComplete;
    expect(chat.shadowRoot.querySelector('.permission-card')).to.equal(null);
    expect(chat.shadowRoot.querySelector('.chat-thinking')).to.not.equal(null);
  });

  [false, true].forEach((scrolledUp) => {
    it(`${scrolledUp ? 'does not follow new approvals while reading history' : 'follows new approvals when already near the bottom'}`, async () => {
      const log = chat.shadowRoot.querySelector('.chat-scroll-container');
      Object.defineProperties(log, {
        scrollHeight: { get: () => (log.querySelector('.permission-card') ? 800 : 400) },
        clientHeight: { value: 100 },
        scrollTop: { value: scrolledUp ? 100 : 300, writable: true },
      });
      chat.pendingPermission = {
        calls: [{ toolCallId: 'tc1', toolName: 'some_tool' }],
        decisions: {},
      };
      await chat.updateComplete;
      await new Promise((resolve) => { requestAnimationFrame(resolve); });
      expect(log.scrollTop).to.equal(scrolledUp ? 100 : 800);
    });
  });

  it('delegates public prompts and submits the input payload once', async () => {
    const context = { id: 'selection', type: 'text', label: 'Selection' };
    const attachment = { id: 'file', dataBase64: 'ZmlsZQ==', label: 'File' };
    chatInput.addItem(context);
    chatInput.addItem(attachment);
    await chat.setPrompt('  Hello world  ', { autoSend: true });
    expect(sent).to.deep.equal([['Hello world', [context], [attachment]]]);
    expect(chatInput.draft).to.equal('');
    expect(chatInput.items).to.deep.equal([]);
  });

  it('retains sole ownership of document prompts and ignores them after disconnect', async () => {
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
      detail: { text: 'External prompt', autoSend: true },
    }));
    await chat.updateComplete;
    await chatInput.updateComplete;
    expect(sent).to.have.length(1);
    chat.remove();
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
      detail: { text: 'Disconnected', autoSend: true },
    }));
    await Promise.resolve();
    expect(sent).to.have.length(1);
  });

  it('keeps keyed ADD_TO_CHAT context and forwards pill activation to the editor', () => {
    const detail = {
      key: 'selection',
      id: 'text',
      type: 'text',
      label: 'Selection',
      selFrom: 1,
      selTo: 4,
      selectionType: 'text',
    };
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, { detail }));
    expect(chatInput.items[0].id).to.equal('text');
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, {
      detail: { ...detail, id: 'replacement' },
    }));
    expect(chatInput.items.map((item) => item.id)).to.deep.equal(['replacement']);
    let highlighted;
    const onHighlight = (e) => { highlighted = e.detail; };
    document.addEventListener(CHAT_EVENT.HIGHLIGHT_SELECTION, onHighlight);
    try {
      chatInput.dispatchEvent(new CustomEvent('nx-pill-activate', { detail }));
      expect(highlighted.selFrom).to.equal(1);
      expect(highlighted.selTo).to.equal(4);
    } finally {
      document.removeEventListener(CHAT_EVENT.HIGHLIGHT_SELECTION, onHighlight);
    }
  });

  it('preserves warm notification, stop, and pending-plan input availability', async () => {
    input.dispatchEvent(new Event('input'));
    expect(warmed).to.equal(1);
    chat.thinking = true;
    await chat.updateComplete;
    await chatInput.updateComplete;
    chatInput.shadowRoot.querySelector('.chat-stop').click();
    expect(stopped).to.equal(1);
    expect(sent).to.have.length(0);
    chat.pendingPlanApproval = { turnId: 'plan' };
    await chat.updateComplete;
    await chatInput.updateComplete;
    expect(input.disabled).to.be.false;
    await chat.setPrompt('Revise the plan', { autoSend: true });
    expect(sent[0][0]).to.equal('Revise the plan');
  });

  it('passes filtered prompts, current skills, and harness appearance to the input', async () => {
    chat._context = { view: 'edit' };
    chat._prompts = [{ area: 'all' }, { area: 'edit' }, { area: 'browse' }];
    chat._harness = 'cma';
    chat.requestUpdate();
    await chat.updateComplete;
    await chatInput.updateComplete;
    expect(chatInput.prompts).to.deep.equal([{ area: 'all' }, { area: 'edit' }]);
    expect(chatInput.getSkills()).to.deep.equal([{ name: 'writeBlog' }]);
    expect(chatInput.shadowRoot.querySelector('.coworker-chat')).to.equal(null);
  });

  it('does not re-render the composer for streamed message chunks', async () => {
    chat.thinking = true;
    await chat.updateComplete;
    await chatInput.updateComplete;
    const render = chatInput.render.bind(chatInput);
    let renders = 0;
    chatInput.render = () => {
      renders += 1;
      return render();
    };
    for (const streamingText of ['First', 'First second', 'First second third']) {
      chat._onControllerUpdate({ messages: [], thinking: true, streamingText });
      await chat.updateComplete;
      await chatInput.updateComplete;
    }
    expect(renders).to.equal(0);
    expect(chat.shadowRoot.querySelector('.message-assistant').textContent)
      .to.include('First second third');
  });

  it('refreshes filtered prompts when the source or view changes', async () => {
    chat._context = { view: 'edit' };
    chat._prompts = [{ title: 'Edit', area: 'edit' }, { title: 'Browse', area: 'browse' }];
    await chat.updateComplete;
    await chatInput.updateComplete;
    expect(chatInput.prompts.map((prompt) => prompt.title)).to.deep.equal(['Edit']);

    chat._context = { view: 'browse' };
    chat.requestUpdate();
    await chat.updateComplete;
    await chatInput.updateComplete;
    expect(chatInput.prompts.map((prompt) => prompt.title)).to.deep.equal(['Browse']);

    chat._prompts = [{ title: 'All', area: 'all' }];
    await chat.updateComplete;
    await chatInput.updateComplete;
    expect(chatInput.prompts.map((prompt) => prompt.title)).to.deep.equal(['All']);
  });
});
