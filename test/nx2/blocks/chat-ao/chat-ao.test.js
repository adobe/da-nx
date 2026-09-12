import { expect } from '@esm-bundle/chai';
import '../../../../nx2/blocks/chat-ao/chat-ao.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';
import { OPEN_COWORKER_ITEM } from '../../../../nx2/blocks/chat-ao/ao-constants.js';

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

describe('nx-chat-ao continue-in-coworker', () => {
  it('appends Continue in Coworker for an existing episode on the normal AO path', () => {
    const el = makeChatAo();
    el.episodeId = 'ep-1';
    expect(el._menuItems.some((item) => item.id === OPEN_COWORKER_ITEM.id)).to.be.true;
  });

  it('omits Continue in Coworker when the alt harness is active', () => {
    const el = makeChatAo();
    el.episodeId = 'ep-1';
    el._altHarness = true;
    expect(el._menuItems.some((item) => item.id === OPEN_COWORKER_ITEM.id)).to.be.false;
  });

  it('omits Continue in Coworker when there is no episode yet', () => {
    const el = makeChatAo();
    expect(el._menuItems.some((item) => item.id === OPEN_COWORKER_ITEM.id)).to.be.false;
  });
});
