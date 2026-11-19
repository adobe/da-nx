import { expect } from '@esm-bundle/chai';
import { ADD_MENU_ITEMS, resolveCmaBridgeBases } from '../../../../nx2/blocks/chat-ao/ao-constants.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';

describe('AO menu constants', () => {
  it('includes the Experience Context management action', () => {
    const item = ADD_MENU_ITEMS.find(({ id }) => id === MENU_OPTIONS.MANAGE_ENTERPRISE_CONTEXT);

    expect(item?.label).to.equal('Manage Experience Context');
  });
});

describe('resolveCmaBridgeBases', () => {
  const prod = { wsBase: 'wss://aem-sites-claudebridge-va6.adobe.io', httpBase: 'https://aem-sites-claudebridge-va6.adobe.io' };
  const dev = { wsBase: 'wss://aem-sites-claudebridge-dev-va6.adobe.io', httpBase: 'https://aem-sites-claudebridge-dev-va6.adobe.io' };
  const local = { wsBase: 'ws://localhost:8080', httpBase: 'http://localhost:8080' };

  it('defaults to the prod bridge', () => {
    expect(resolveCmaBridgeBases('')).to.deep.equal(prod);
  });

  it('selects the dev bridge with ?bridge=dev', () => {
    expect(resolveCmaBridgeBases('?nx=local&bridge=dev')).to.deep.equal(dev);
  });

  it('selects a local bridge with ?ref=local, over ?bridge', () => {
    expect(resolveCmaBridgeBases('?ref=local')).to.deep.equal(local);
    expect(resolveCmaBridgeBases('?bridge=dev&ref=local')).to.deep.equal(local);
  });

  it('ignores any other value', () => {
    expect(resolveCmaBridgeBases('?bridge=evil.example.com&ref=evil')).to.deep.equal(prod);
  });
});
