import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../../nx2/blocks/chat-ao/chat-ao.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';
import { OPEN_COWORKER_ITEM, COWORKER_SKILLS_URL } from '../../../../nx2/blocks/chat-ao/ao-constants.js';

function makeChatAo() {
  return document.createElement('nx-chat-ao');
}

describe('nx-chat-ao add menu', () => {
  it('includes Customize Coworker when the alt harness is not active', () => {
    const el = makeChatAo();
    expect(el._addMenuItems.some((item) => item.id === MENU_OPTIONS.MANAGE_SKILLS)).to.be.true;
  });

  it('keeps the skills item on the alt harness but relabels it to Manage Skills', () => {
    const el = makeChatAo();
    el._altHarness = true;
    const item = el._addMenuItems.find((i) => i.id === MENU_OPTIONS.MANAGE_SKILLS);
    expect(item).to.exist;
    expect(item.label).to.equal('Manage Skills');
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

  it('shows Manage Skills but not Continue in Coworker on the alt harness', () => {
    const el = makeChatAo();
    el.episodeId = 'ep-1';
    el._altHarness = true;
    const labels = el._menuItems.map((item) => item.label);
    expect(labels).to.include('Manage Skills');
    expect(labels).to.not.include(OPEN_COWORKER_ITEM.label);
  });
});

describe('nx-chat-ao manage skills click', () => {
  afterEach(() => sinon.restore());

  it('opens COWORKER_SKILLS_URL when the alt harness is not active', () => {
    const el = makeChatAo();
    const openStub = sinon.stub(window, 'open');
    el._handleMenuSelect({ detail: { id: MENU_OPTIONS.MANAGE_SKILLS } });
    expect(openStub.calledOnce).to.be.true;
    expect(openStub.firstCall.args[0]).to.equal(COWORKER_SKILLS_URL);
  });

  it('opens the Skills Editor URL for the current org/site when the alt harness is active', () => {
    const el = makeChatAo();
    el._altHarness = true;
    el._context = { org: 'exp-workspace', site: 'frescopa' };
    const openStub = sinon.stub(window, 'open');
    el._handleMenuSelect({ detail: { id: MENU_OPTIONS.MANAGE_SKILLS } });
    expect(openStub.calledOnce).to.be.true;
    const [url] = openStub.firstCall.args;
    expect(url).to.not.equal(COWORKER_SKILLS_URL);
    expect(url).to.include('/apps/skills');
    expect(url).to.include('tab=skills');
    expect(url).to.include('#/exp-workspace/frescopa');
  });
});
