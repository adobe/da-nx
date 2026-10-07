import { expect } from '@esm-bundle/chai';
import {
  ADD_MENU_ITEMS,
  ENTERPRISE_CONTEXT_URL,
} from '../../../../nx2/blocks/chat-ao/ao-constants.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';

describe('AO menu constants', () => {
  it('links Experience Context to its canonical Experience Hub route', () => {
    const item = ADD_MENU_ITEMS.find(({ id }) => id === MENU_OPTIONS.MANAGE_ENTERPRISE_CONTEXT);

    expect(item?.label).to.equal('Manage Experience Context');
    expect(ENTERPRISE_CONTEXT_URL).to.equal(
      'https://experience.adobe.com/#/experiencemanager/experience-context',
    );
  });
});
