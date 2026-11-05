import { expect } from '@esm-bundle/chai';
import '../../../../nx2/blocks/chat-ao/chat-ao.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';
import {
  ADD_MENU_ITEMS, ADD_MENU_ITEMS_WITH_EPISODE, ADD_MENU_ITEMS_CMA,
} from '../../../../nx2/blocks/chat-ao/ao-constants.js';

const labels = (items) => items.filter((i) => i.label).map((i) => i.label);

describe('chat-ao menu by harness', () => {
  let chat;
  beforeEach(() => {
    chat = document.createElement('nx-chat-ao');
    chat._context = { org: 'o', site: 's' };
  });

  it('CMA menu has Manage Skills and NOTHING Coworker', () => {
    const l = labels(ADD_MENU_ITEMS_CMA);
    expect(l).to.include('Manage Skills');
    expect(l).to.include('Manage Prompts');
    expect(l).to.include('Manage Experience Context');
    expect(l).to.not.include('Manage Coworker');
    expect(l).to.not.include('Continue in Coworker');
  });

  it('CMA harness selects the CMA menu regardless of episode', () => {
    chat._harness = 'cma';
    chat.episodeId = 'ep-1';
    expect(chat._menuItems).to.equal(ADD_MENU_ITEMS_CMA);
  });

  it('Coworker harness keeps the Coworker menu (and the episode variant)', () => {
    chat._harness = 'coworker';
    chat.episodeId = undefined;
    expect(chat._menuItems).to.equal(ADD_MENU_ITEMS);
    chat.episodeId = 'ep-1';
    expect(chat._menuItems).to.equal(ADD_MENU_ITEMS_WITH_EPISODE);
  });

  it('CMA Manage Skills opens the ew-extensions skills app, not Coworker', () => {
    chat._harness = 'cma';
    let opened;
    const realOpen = window.open;
    window.open = (href) => { opened = href; };
    try {
      chat._handleMenuSelect(MENU_OPTIONS.MANAGE_SKILLS);
    } finally {
      window.open = realOpen;
    }
    expect(opened).to.be.a('string');
    expect(opened).to.include('/apps/skills');
    expect(opened).to.include(`tab=${MENU_OPTIONS.MANAGE_SKILLS}`);
    expect(opened).to.include('#/o/s');
  });

  it('Coworker harness Manage Skills opens CX Coworker, not the skills app', () => {
    chat._harness = 'coworker';
    let opened;
    const realOpen = window.open;
    window.open = (href) => { opened = href; };
    try {
      chat._handleMenuSelect(MENU_OPTIONS.MANAGE_SKILLS);
    } finally {
      window.open = realOpen;
    }
    expect(opened).to.be.a('string');
    expect(opened).to.not.include('/apps/skills');
    expect(opened).to.include('experience.adobe.com');
  });
});
