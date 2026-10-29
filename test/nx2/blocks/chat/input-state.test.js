import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../../nx2/blocks/chat/chat.js';
import '../../../../nx2/blocks/chat-ao/chat-ao.js';
import { CHAT_EVENT } from '../../../../nx2/utils/chat.js';

describe('chat input coordination', () => {
  let chat;
  const tokens = new CSSStyleSheet();

  before(async () => {
    tokens.replaceSync(await (await fetch('/nx2/styles/styles.css')).text());
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, tokens];
  });

  after(() => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== tokens);
  });

  afterEach(() => {
    chat?.remove();
    sinon.restore();
  });

  function inputRoot() {
    return chat.shadowRoot.querySelector('nx-ao-input')?.shadowRoot ?? chat.shadowRoot;
  }

  async function mount(tag) {
    sinon.stub(window, 'fetch').resolves(new Response('{}'));
    chat = document.createElement(tag);
    chat.attachShadow({ mode: 'open' });
    chat._controller = {
      setContext() {},
      destroy() {},
      getSkills: () => [],
      reattachIfIdle() {},
      sendMessage: sinon.spy(),
    };
    chat.context = {};
    chat.showInputStatus = true;
    document.body.append(chat);
    await chat.updateComplete;
    await chat.shadowRoot.querySelector('nx-ao-input')?.updateComplete;
    return inputRoot().querySelector('.chat-input');
  }

  ['nx-chat', 'nx-chat-ao'].forEach((tag) => {
    it(`${tag} broadcasts processing state and preserves the disabled draft until completion`, async () => {
      const input = await mount(tag);
      chat.connected = true;
      await chat.updateComplete;
      input.value = 'Unsent draft';
      const states = [];
      chat.addEventListener(CHAT_EVENT.INPUT_STATE_CHANGE, ({ detail }) => states.push(detail));
      chat.thinking = true;
      await chat.updateComplete;
      expect(chat.inputState).to.deep.equal({ busy: true, disabled: true });
      expect(states.at(-1)).to.deep.equal(chat.inputState);
      expect(input.disabled).to.equal(true);
      expect(input.hidden).to.equal(true);
      expect(inputRoot().querySelector('.chat-working').textContent).to.include('Working on your question, please wait...');
      expect(inputRoot().querySelector('.chat-add').disabled).to.equal(true);
      const add = sinon.spy(inputRoot().querySelector('nx-pills'), 'add');
      const owner = chat.shadowRoot.querySelector('nx-ao-input') ?? chat;
      await owner._onFilesSelected([new File(['draft'], 'draft.md', { type: 'text/markdown' })]);
      expect(add.called).to.equal(false);
      expect(await chat.setPrompt('Lost update', { replace: false })).to.equal(false);
      expect(input.value).to.equal('Unsent draft');
      chat.thinking = false;
      await chat.updateComplete;
      expect(states.at(-1)).to.deep.equal({ busy: false, disabled: false });
      expect(input.hidden).to.equal(false);
      expect(input.disabled).to.equal(false);
      expect(input.value).to.equal('Unsent draft');
      expect(inputRoot().querySelector('.chat-working')).to.equal(null);
    });

    it(`${tag} accepts a draft without sending and refuses to replace another draft`, async () => {
      const input = await mount(tag);
      chat.connected = true;
      await chat.updateComplete;
      expect(await chat.setPrompt('Landing draft', { replace: false })).to.equal(true);
      expect(input.value).to.equal('Landing draft');
      expect(await chat.setPrompt('Another draft', { replace: false })).to.equal(false);
      expect(input.value).to.equal('Landing draft');
      expect(await chat.setPrompt('Landing draft', { replace: false })).to.equal(true);
      expect(await chat.setPrompt('Explicit replacement')).to.equal(true);
      expect(input.value).to.equal('Explicit replacement');
    });

    it(`${tag} leaves the existing processing UI unchanged unless input status is requested`, async () => {
      const input = await mount(tag);
      chat.showInputStatus = false;
      chat.thinking = true;
      await chat.updateComplete;
      expect(input.disabled).to.equal(true);
      expect(input.hidden).to.equal(false);
      expect(inputRoot().querySelector('.chat-working')).to.equal(null);
      expect(inputRoot().querySelector('.chat-form').classList.contains('is-processing')).to.equal(false);
    });

    it(`${tag} shares guarded Stop between host and left controls without sending or losing a draft`, async () => {
      const input = await mount(tag);
      chat.connected = true;
      await chat.updateComplete;
      input.value = 'Keep this draft';
      const states = [];
      chat.addEventListener(CHAT_EVENT.INPUT_STATE_CHANGE, ({ detail }) => states.push(detail));
      const stop = sinon.spy(() => { chat.thinking = false; });
      chat._controller.stop = stop;
      chat.stop();
      expect(stop.called).to.equal(false);
      chat.thinking = true;
      await chat.updateComplete;
      const form = inputRoot().querySelector('.chat-form');
      const leftStop = form.querySelector('.chat-stop');
      expect(leftStop.type).to.equal('button');
      expect(leftStop.getAttribute('aria-label')).to.equal('Stop');
      expect(form.classList.contains('is-processing')).to.equal(true);
      for (const scheme of ['light', 'dark']) {
        chat.style.colorScheme = scheme;
        const color = scheme === 'light' ? '0, 0, 0' : '255, 255, 255';
        const background = scheme === 'light' ? '255, 255, 255' : '34, 34, 34';
        expect(getComputedStyle(form).backgroundImage).to.equal('none');
        expect(getComputedStyle(form).backgroundColor).to.equal(`rgba(${background}, 0.8)`);
        expect(getComputedStyle(form).borderColor).to.equal(`rgba(${color}, 0.06)`);
        expect(getComputedStyle(form.querySelector('.chat-working')).color).to.equal(`rgba(${color}, 0.56)`);
        expect(getComputedStyle(form, '::after').content).to.equal('none');
        expect(leftStop.getBoundingClientRect().width).to.equal(24);
        expect(leftStop.getBoundingClientRect().height).to.equal(24);
        expect(getComputedStyle(leftStop).borderRadius).to.equal('50%');
        const spinner = form.querySelector('.nx-loading-spinner');
        const spinnerStyle = getComputedStyle(spinner);
        expect(spinnerStyle.width).to.equal('16px');
        expect(spinnerStyle.height).to.equal('16px');
        expect(spinnerStyle.borderTopWidth).to.equal('2px');
        expect(spinnerStyle.borderTopColor).to.equal(scheme === 'light' ? 'rgb(59, 99, 251)' : 'rgb(86, 129, 255)');
        expect(spinnerStyle.borderRightColor).to.equal(scheme === 'light' ? 'rgb(218, 218, 218)' : 'rgb(57, 57, 57)');
      }
      chat.stop();
      leftStop.click();
      expect(stop.calledOnce).to.equal(true);
      await chat.updateComplete;
      expect(states.at(-1)).to.deep.equal({ busy: false, disabled: false });
      expect(input.disabled).to.equal(false);
      expect(input.value).to.equal('Keep this draft');
      expect(form.classList.contains('is-processing')).to.equal(false);
      chat.thinking = true;
      await chat.updateComplete;
      leftStop.click();
      chat.stop();
      expect(stop.callCount).to.equal(2);
      await chat.updateComplete;
      expect(input.value).to.equal('Keep this draft');
      expect(chat._controller.sendMessage.called).to.equal(false);
    });

    it(`${tag} keeps the Stop circle and blue progress arc without host theme tokens`, async () => {
      await mount(tag);
      ['--s2-blue-900', '--s2-gray-300', '--s2-corner-radius-800'].forEach((token) => {
        chat.style.setProperty(token, 'initial');
      });
      const stop = inputRoot().querySelector('.chat-stop');
      expect(getComputedStyle(stop).borderRadius).to.equal('50%');
      chat.connected = true;
      chat.thinking = true;
      await chat.updateComplete;
      for (const scheme of ['light', 'dark']) {
        chat.style.colorScheme = scheme;
        const stopStyle = getComputedStyle(stop);
        expect(stop.getBoundingClientRect().width).to.equal(24);
        expect(stop.getBoundingClientRect().height).to.equal(24);
        expect(stopStyle.borderRadius).to.equal('50%');
        expect(stopStyle.padding).to.equal('0px');
        const spinner = getComputedStyle(inputRoot().querySelector('.nx-loading-spinner'));
        expect(spinner.borderTopWidth).to.equal('2px');
        expect(spinner.borderTopColor).to.equal(scheme === 'light' ? 'rgb(59, 99, 251)' : 'rgb(86, 129, 255)');
        expect(spinner.borderRightColor).to.equal(scheme === 'light' ? 'rgb(218, 218, 218)' : 'rgb(57, 57, 57)');
      }
    });

    it(`${tag} applies shared input token overrides without replacing the draft`, async () => {
      const textarea = await mount(tag);
      textarea.value = 'Keep this draft';
      const host = chat.shadowRoot.querySelector('nx-ao-input') ?? chat;
      host.style.setProperty('--nx-chat-input-working-background', 'rgb(12 34 56)');
      host.style.setProperty('--nx-chat-input-working-shadow', 'none');
      host.style.setProperty('--nx-chat-input-spinner-size', '18px');
      host.style.setProperty('--nx-chat-input-stop-size', '32px');
      chat.connected = true;
      chat.thinking = true;
      await chat.updateComplete;
      await host.updateComplete;
      const form = inputRoot().querySelector('.chat-form');
      expect(getComputedStyle(form).backgroundColor).to.equal('rgb(12, 34, 56)');
      expect(getComputedStyle(form).boxShadow).to.equal('none');
      expect(form.querySelector('.nx-loading-spinner').getBoundingClientRect().width).to.equal(18);
      expect(form.querySelector('.chat-stop').getBoundingClientRect().width).to.equal(32);
      expect(textarea.value).to.equal('Keep this draft');
    });

    it(`${tag} submits one staged prompt with attachments through the public autoSend API`, async () => {
      const input = await mount(tag);
      chat.connected = true;
      await chat.updateComplete;
      expect(await chat.setPrompt('Use this draft', { replace: false })).to.equal(true);
      const attachment = { id: 'file', label: 'draft.md', mimeType: 'text/markdown', dataBase64: 'ZmlsZQ==' };
      document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, { detail: attachment }));
      await chat.updateComplete;
      expect(await chat.setPrompt('Use this draft', { replace: false, autoSend: true })).to.equal(true);
      const send = chat._controller.sendMessage;
      expect(send.calledOnce).to.equal(true);
      expect(send.firstCall.args[0]).to.equal('Use this draft');
      expect(JSON.stringify(send.firstCall.args[2])).to.include('ZmlsZQ==');
      expect(input.value).to.equal('');
      expect(inputRoot().querySelector('nx-pills').items).to.have.length(0);
    });
  });

  it('keeps AO plan feedback available, but blocks handoff while switching episodes', async () => {
    await mount('nx-chat-ao');
    chat.thinking = true;
    chat.pendingPlanApproval = { turnId: 'turn' };
    await chat.updateComplete;
    expect(chat.inputState).to.deep.equal({ busy: false, disabled: false });
    chat.loadingEpisode = true;
    await chat.updateComplete;
    expect(chat.inputState).to.deep.equal({ busy: false, disabled: true });
    expect(await chat.setPrompt('Wrong episode')).to.equal(false);
    inputRoot().querySelector('.chat-input').value = 'Wrong episode';
    chat.shadowRoot.querySelector('nx-ao-input')._submit();
    expect(inputRoot().querySelector('.chat-input').value).to.equal('Wrong episode');
  });

  it('keeps expanded AO controls in the Figma frame and scales without replacing the draft', async () => {
    const textarea = await mount('nx-chat-ao');
    const input = chat.shadowRoot.querySelector('nx-ao-input');
    input.variant = 'expanded';
    await input.updateComplete;
    textarea.value = 'Keep this draft';
    const form = inputRoot().querySelector('form');
    const send = inputRoot().querySelector('.chat-send');
    expect(form.getBoundingClientRect().height).to.equal(77);
    expect(send.getBoundingClientRect().width).to.equal(32);
    expect(getComputedStyle(textarea).fontSize).to.equal('16px');
    chat.thinking = true;
    await chat.updateComplete;
    await input.updateComplete;
    const stop = inputRoot().querySelector('.chat-stop');
    expect(form.getBoundingClientRect().height).to.equal(77);
    expect(stop.getBoundingClientRect().width).to.equal(32);
    expect(getComputedStyle(stop).borderRadius).to.equal('50%');
    expect(getComputedStyle(form).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    input.size = 'm';
    await input.updateComplete;
    expect(stop.getBoundingClientRect().width).to.equal(40);
    expect(getComputedStyle(textarea).fontSize).to.equal('18px');
    expect(textarea.value).to.equal('Keep this draft');
  });

  it('accepts one disconnected legacy draft and delivers it when the connection is ready', async () => {
    const input = await mount('nx-chat');
    expect(chat.inputState).to.deep.equal({ busy: false, disabled: true });
    expect(chat.setPrompt('Pending', { replace: false })).to.equal(true);
    expect(chat.setPrompt('Another', { replace: false })).to.equal(false);
    chat.connected = true;
    await chat.updateComplete;
    expect(input.value).to.equal('Pending');
    expect(chat.inputState.disabled).to.equal(false);
  });

  it('waits for the legacy connection before sending a staged prompt once with its files', async () => {
    await mount('nx-chat');
    expect(chat.setPrompt('Pending', { replace: false })).to.equal(true);
    const attachment = { id: 'file', label: 'draft.md', mimeType: 'text/markdown', dataBase64: 'ZmlsZQ==' };
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, { detail: attachment }));
    expect(chat.setPrompt('Pending', { replace: false, autoSend: true })).to.equal(true);
    expect(chat._controller.sendMessage.called).to.equal(false);
    chat.connected = true;
    await chat.updateComplete;
    expect(chat._controller.sendMessage.calledOnce).to.equal(true);
    expect(JSON.stringify(chat._controller.sendMessage.firstCall.args[2])).to.include('ZmlsZQ==');
    chat.connected = false;
    await chat.updateComplete;
    chat.connected = true;
    await chat.updateComplete;
    expect(chat._controller.sendMessage.calledOnce).to.equal(true);
  });
});
