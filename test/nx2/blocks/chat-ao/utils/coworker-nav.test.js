import { expect } from '@esm-bundle/chai';
import {
  COWORKER_SKILLS_PATH, ENTERPRISE_CONTEXT_PATH, getCoworkerHref, loadCoworkerNav,
} from '../../../../../nx2/blocks/chat-ao/utils/coworker-nav.js';
import { resetMockIms, setMockIms } from '../../../../../nx2/test/mocks/ims.js';

describe('getCoworkerHref', () => {
  [
    { path: COWORKER_SKILLS_PATH, suffix: 'customizations' },
    { path: ENTERPRISE_CONTEXT_PATH, suffix: 'experience-context' },
    { path: 'episode-123', suffix: 'episode-123' },
    { path: undefined, suffix: '' },
  ].forEach(({ path, suffix }) => {
    it(`scopes ${suffix || 'the landing page'} to the IMS tenant name`, () => {
      expect(getCoworkerHref({ tenantId: 'sitesinternal', path })).to.equal(
        `https://experience.adobe.com/#/@sitesinternal/coworker/i/${suffix}`,
      );
    });
  });

  it('encodes the organization and destination as individual route segments', () => {
    expect(getCoworkerHref({ tenantId: 'org/name?#', path: 'episode/id?#' })).to.equal(
      'https://experience.adobe.com/#/@org%2Fname%3F%23/coworker/i/episode%2Fid%3F%23',
    );
  });

  [undefined, null, '', ' ', 123].forEach((tenantId) => {
    it(`falls back to the unscoped route for ${JSON.stringify(tenantId)}`, () => {
      expect(getCoworkerHref({ tenantId, path: COWORKER_SKILLS_PATH })).to.equal(
        'https://experience.adobe.com/#/coworker/customizations',
      );
    });
  });
});

describe('loadCoworkerNav', () => {
  beforeEach(resetMockIms);
  afterEach(resetMockIms);

  it('returns a synchronous resolver using the loaded IMS tenant name', async () => {
    setMockIms({ tenantId: 'sitesinternal', ownerOrg: 'active-org@AdobeOrg' });
    const nav = await loadCoworkerNav();

    expect(nav(COWORKER_SKILLS_PATH)).to.equal(
      'https://experience.adobe.com/#/@sitesinternal/coworker/i/customizations',
    );
    expect(nav('episode-123')).to.equal(
      'https://experience.adobe.com/#/@sitesinternal/coworker/i/episode-123',
    );
  });

  it('keeps separate profile snapshots without sharing organization state', async () => {
    setMockIms({ tenantId: 'first-tenant' });
    const firstNav = await loadCoworkerNav();
    setMockIms({ tenantId: 'second-tenant' });
    const secondNav = await loadCoworkerNav();

    expect(firstNav(COWORKER_SKILLS_PATH)).to.equal(
      'https://experience.adobe.com/#/@first-tenant/coworker/i/customizations',
    );
    expect(secondNav(COWORKER_SKILLS_PATH)).to.equal(
      'https://experience.adobe.com/#/@second-tenant/coworker/i/customizations',
    );
  });

  it('does not substitute the organization ID for a missing routing name', async () => {
    setMockIms({ tenantId: null, ownerOrg: 'active-org@AdobeOrg' });
    const nav = await loadCoworkerNav();

    expect(nav(COWORKER_SKILLS_PATH)).to.equal(
      'https://experience.adobe.com/#/coworker/customizations',
    );
  });
});
