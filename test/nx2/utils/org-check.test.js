import { expect } from '@esm-bundle/chai';
import { DA_ADMIN, HLX_ADMIN } from '../../../nx2/utils/utils.js';
import { DA_ORIGIN } from '../../../nx/public/utils/constants.js';
import {
  calls, installFetch, restoreFetch,
} from '../../../nx2/test/mocks/fetch.js';

const originalHref = window.location.href;
history.replaceState(null, '', '/browse');
const { orgCheck: checkNx } = await import('../../../nx/utils/org-check.js');
const { orgCheck: checkNx2 } = await import('../../../nx2/utils/org-check.js');

for (const [name, check, origin] of [['nx', checkNx, DA_ORIGIN], ['nx2', checkNx2, DA_ADMIN]]) {
  describe(`${name} org sandbox check`, () => {
    afterEach(() => {
      restoreFetch();
      history.replaceState(null, '', originalHref);
    });

    it('does not request legacy org config or content for an hlx6 site', async () => {
      const org = `sandbox-hlx6-${name}`;
      const site = 'site';
      history.replaceState(null, '', `/browse#/${org}/${site}/folder`);
      installFetch({ pingHlx6: true });

      await check();

      expect(calls.map((call) => call.url)).to.deep.equal([`${HLX_ADMIN}/ping/${org}/${site}`]);
    });

    it('still checks legacy org permissions on a legacy site', async () => {
      const org = `sandbox-legacy-${name}`;
      history.replaceState(null, '', `/browse#/${org}/site`);
      installFetch({ body: JSON.stringify({ permissions: { data: [] } }) });

      await check();

      expect(calls.map((call) => call.url)).to.deep.equal([
        `${HLX_ADMIN}/ping/${org}/site`,
        `${origin}/config/${org}/`,
      ]);
    });

    it('still checks legacy org permissions in an org-only view', async () => {
      const org = `sandbox-org-${name}`;
      history.replaceState(null, '', `/browse#/${org}/`);
      installFetch({ body: JSON.stringify({ permissions: { data: [] } }) });

      await check();

      expect(calls.map((call) => call.url)).to.deep.equal([`${origin}/config/${org}/`]);
    });
  });
}
