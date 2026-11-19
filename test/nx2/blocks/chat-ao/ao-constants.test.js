import { expect } from '@esm-bundle/chai';
import { ADD_MENU_ITEMS, resolveCmaBridgeHost } from '../../../../nx2/blocks/chat-ao/ao-constants.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';

describe('AO menu constants', () => {
  it('includes the Experience Context management action', () => {
    const item = ADD_MENU_ITEMS.find(({ id }) => id === MENU_OPTIONS.MANAGE_ENTERPRISE_CONTEXT);

    expect(item?.label).to.equal('Manage Experience Context');
  });
});

describe('resolveCmaBridgeHost', () => {
  it('defaults to the prod bridge', () => {
    expect(resolveCmaBridgeHost('')).to.equal('aem-sites-claudebridge-va6.adobe.io');
  });

  it('selects the dev bridge with ?bridge=dev', () => {
    expect(resolveCmaBridgeHost('?nx=local&bridge=dev')).to.equal('aem-sites-claudebridge-dev-va6.adobe.io');
  });

  it('ignores any other value', () => {
    expect(resolveCmaBridgeHost('?bridge=evil.example.com')).to.equal('aem-sites-claudebridge-va6.adobe.io');
  });
});
