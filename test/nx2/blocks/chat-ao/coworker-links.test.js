import { expect } from '@esm-bundle/chai';
import NxChatAo from '../../../../nx2/blocks/chat-ao/chat-ao.js';
import { MENU_OPTIONS } from '../../../../nx2/blocks/shared/chat/constants.js';
import { resetMockIms, setMockIms } from '../../../../nx2/test/mocks/ims.js';

describe('Coworker menu navigation', () => {
  let originalOpen;
  let calls;
  let chat;

  beforeEach(() => {
    resetMockIms();
    setMockIms({ ownerOrg: 'active-org@AdobeOrg', tenantId: 'sitesinternal' });
    calls = [];
    originalOpen = window.open;
    window.open = (...args) => { calls.push(args); };
    chat = new NxChatAo();
    chat._context = { org: 'da-content-org', site: 'www' };
  });

  afterEach(() => {
    window.open = originalOpen;
    document.getElementById('nx-toast-host')?.remove();
    resetMockIms();
  });

  [
    { id: MENU_OPTIONS.MANAGE_SKILLS, destination: 'customizations' },
    { id: MENU_OPTIONS.MANAGE_ENTERPRISE_CONTEXT, destination: 'experience-context' },
    { id: MENU_OPTIONS.OPEN_COWORKER, destination: 'episode-123' },
  ].forEach(({ id, destination }) => {
    it(`opens ${id} synchronously using the IMS routing name, not org ID or DA org`, async () => {
      chat.episodeId = 'episode-123';
      await chat._loadCoworkerNav();

      chat._handleMenuSelect(id);

      expect(calls).to.deep.equal([[
        `https://experience.adobe.com/#/@sitesinternal/coworker/i/${destination}`,
        '_blank',
        'noopener,noreferrer',
      ]]);
    });

    it(`opens the previous ${id} route synchronously before navigation is ready`, () => {
      chat.episodeId = 'episode-123';

      chat._handleMenuSelect(id);

      expect(calls).to.deep.equal([[
        `https://experience.adobe.com/#/coworker/${destination}`,
        '_blank',
        'noopener,noreferrer',
      ]]);
    });
  });

  it('updates the destination when the IMS profile is reloaded for another organization', async () => {
    await chat._loadCoworkerNav();
    setMockIms({ ownerOrg: 'other-org@AdobeOrg', tenantId: 'other-tenant' });
    await chat._loadCoworkerNav();

    chat._handleMenuSelect(MENU_OPTIONS.MANAGE_SKILLS);

    expect(calls[0][0]).to.equal(
      'https://experience.adobe.com/#/@other-tenant/coworker/i/customizations',
    );
  });

  it('does not offer an episode redirect without an active episode', async () => {
    await chat._loadCoworkerNav();
    chat._handleMenuSelect(MENU_OPTIONS.OPEN_COWORKER);
    expect(calls).to.have.length(0);
  });

  it('uses the unscoped route during a profile reload, then switches to the new org', async () => {
    await chat._loadCoworkerNav();
    setMockIms({ tenantId: 'other-tenant' });
    const loading = chat._loadCoworkerNav();

    chat._handleMenuSelect(MENU_OPTIONS.MANAGE_SKILLS);
    expect(calls[0][0]).to.equal('https://experience.adobe.com/#/coworker/customizations');

    await loading;
    chat._handleMenuSelect(MENU_OPTIONS.MANAGE_SKILLS);
    expect(calls[1][0]).to.equal(
      'https://experience.adobe.com/#/@other-tenant/coworker/i/customizations',
    );
  });

  it('uses the previous unscoped route when the IMS routing name is missing', async () => {
    setMockIms({ tenantId: null });
    await chat._loadCoworkerNav();

    chat._handleMenuSelect(MENU_OPTIONS.MANAGE_SKILLS);

    expect(calls[0][0]).to.equal('https://experience.adobe.com/#/coworker/customizations');
    expect(document.getElementById('nx-toast-host')).not.to.exist;
  });

  it('keeps Manage Prompts on the existing DA config flow', () => {
    let configOpened = false;
    chat._openConfigPage = () => { configOpened = true; };

    chat._handleMenuSelect(MENU_OPTIONS.MANAGE_PROMPT);

    expect(configOpened).to.equal(true);
    expect(calls).to.have.length(0);
  });
});
