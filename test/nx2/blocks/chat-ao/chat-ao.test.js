import { expect } from '@esm-bundle/chai';
import '../../../../nx2/blocks/chat-ao/chat-ao.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';

function makeChatAo() {
  return document.createElement('nx-chat-ao');
}

describe('nx-chat-ao add menu', () => {
  it('includes Customize Coworker when the alt harness is not active', () => {
    const el = makeChatAo();
    expect(el._addMenuItems.some((item) => item.id === MENU_OPTIONS.MANAGE_SKILLS)).to.be.true;
  });

  it('hides Customize Coworker when the alt harness is active', () => {
    const el = makeChatAo();
    el._altHarness = true;
    const items = el._addMenuItems;
    expect(items.some((item) => item.id === MENU_OPTIONS.MANAGE_SKILLS)).to.be.false;
    expect(items.some((item, i) => item.divider && !items[i + 1])).to.be.false;
  });
});
