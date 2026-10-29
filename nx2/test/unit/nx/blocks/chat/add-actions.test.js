import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';
import { MENU_OPTIONS } from '../../../../../blocks/shared/chat/constants.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/chat/chat.js');
await import('../../../../../blocks/chat-ao/chat-ao.js');

['nx-chat', 'nx-chat-ao'].forEach((name) => {
  describe(`${name} external Add actions`, () => {
    const { prototype } = customElements.get(name);
    let host;

    beforeEach(() => {
      const root = document.createElement('div');
      root.innerHTML = '<textarea class="chat-input"></textarea>';
      host = {
        updateComplete: Promise.resolve(),
        shadowRoot: root,
        _openFilePicker: sinon.spy(),
        _openPrompts: sinon.spy(),
        _slashMenu: { insertSlash: sinon.spy() },
      };
    });

    [
      [MENU_OPTIONS.FILES, '_openFilePicker'],
      [MENU_OPTIONS.PROMPT, '_openPrompts'],
    ].forEach(([action, method]) => {
      it(`reuses its existing ${action} action`, async () => {
        await prototype.openAddAction.call(host, action);
        expect(host[method].calledOnce).to.equal(true);
      });
    });

    it('reuses its slash menu without sending a message', async () => {
      await prototype.openAddAction.call(host, MENU_OPTIONS.COMMAND);
      expect(host._slashMenu.insertSlash.calledOnce).to.equal(true);
    });

    it('routes its own menu through the same public action', async () => {
      const openAddAction = sinon.stub().resolves();
      await prototype._handleMenuSelect.call({ openAddAction }, {
        detail: { id: MENU_OPTIONS.PROMPT },
      });
      expect(openAddAction.calledOnceWithExactly(MENU_OPTIONS.PROMPT)).to.equal(true);
    });

    if (name === 'nx-chat') {
      it('keeps a queued draft when an Add action arrives before the connection', async () => {
        host._pendingPrompt = { text: 'Update the hero', autoSend: false };
        await prototype.openAddAction.call(host, MENU_OPTIONS.COMMAND);
        expect(host.shadowRoot.querySelector('textarea').value).to.equal('Update the hero');
        expect(host._pendingPrompt).to.equal(null);
      });
    }
  });
});
