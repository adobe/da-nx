import { expect } from '@esm-bundle/chai';
import { ADD_MENU_ITEMS } from '../../../../nx2/blocks/chat-ao/ao-constants.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';

describe('AO menu constants', () => {
  it('includes the Experience Context management action', () => {
    const item = ADD_MENU_ITEMS.find(({ id }) => id === MENU_OPTIONS.MANAGE_ENTERPRISE_CONTEXT);

    expect(item?.label).to.equal('Manage Experience Context');
  });
});
