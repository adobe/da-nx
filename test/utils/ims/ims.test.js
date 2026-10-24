import { expect } from '@esm-bundle/chai';
import { stub } from 'sinon';

const IMS_URL = 'https://auth.services.adobe.com/imslib/imslib.min.js';
const AVATAR_SCOPE = 'additional_info.user_image_url';
let moduleId = 0;

[
  { name: 'NX', path: '../../../nx/utils/ims.js', configPath: '../../../nx/scripts/nexter.js' },
  { name: 'NX2', path: '../../../nx2/utils/ims.js', configPath: '../../../nx2/scripts/nx.js' },
].forEach(({ name, path, configPath }) => {
  describe(`${name} IMS avatar integration`, () => {
    let originalAdobeIMS;
    let originalAdobeid;
    let originalImsStorage;
    let appendStub;
    let fetchStub;
    let profile;
    let accessToken;

    beforeEach(() => {
      originalAdobeIMS = window.adobeIMS;
      originalAdobeid = window.adobeid;
      originalImsStorage = localStorage.getItem('nx-ims');
      profile = {
        userId: 'test-user@AdobeID',
        displayName: 'Test User',
        email: 'test-user@adobe.com',
        user_image_url: '/nx/public/icons/S2_Icon_User_20_N.svg',
      };
      accessToken = { token: 'test-token' };
      window.adobeIMS = {
        getAccessToken: stub().callsFake(() => accessToken),
        getProfile: stub().callsFake(async () => profile),
      };

      // Exercise onReady without loading the real SDK or making external requests.
      const originalAppend = document.head.append;
      appendStub = stub(document.head, 'append').callsFake((...nodes) => {
        if (nodes.some((node) => node.src === IMS_URL)) {
          queueMicrotask(() => window.adobeid.onReady());
          return;
        }
        originalAppend.apply(document.head, nodes);
      });
      fetchStub = stub(window, 'fetch').rejects(new Error('Unexpected network request'));
    });

    afterEach(() => {
      appendStub.restore();
      fetchStub.restore();
      window.adobeIMS = originalAdobeIMS;
      window.adobeid = originalAdobeid;
      if (originalImsStorage === null) localStorage.removeItem('nx-ims');
      else localStorage.setItem('nx-ims', originalImsStorage);
    });

    async function loadModule(imsScope) {
      // Match the config module used by runtime imports, without WTR's import-map query.
      const configHref = new URL(configPath, import.meta.url).href;
      const { setConfig } = await import(configHref);
      await setConfig({ imsClientId: 'nexter', imsScope });
      moduleId += 1;
      // A query bypasses NX2's import-map mock and gives each test fresh IMS state.
      return import(`${path}?avatar-test=${moduleId}`);
    }

    [
      { scope: undefined, expected: ['AdobeID', 'openid', 'gnav', AVATAR_SCOPE] },
      { scope: 'AdobeID,openid,org.read', expected: ['AdobeID', 'openid', 'org.read', AVATAR_SCOPE] },
      {
        scope: `AdobeID, ${AVATAR_SCOPE},openid,${AVATAR_SCOPE},`,
        expected: ['AdobeID', AVATAR_SCOPE, 'openid'],
      },
    ].forEach(({ scope, expected }) => {
      it(`adds the avatar scope without duplicates for ${scope || 'default scopes'}`, async () => {
        const { loadIms } = await loadModule(scope);
        const ims = await loadIms();
        expect(window.adobeid.scope.split(',')).to.deep.equal(expected);
        expect(ims.user_image_url).to.equal(profile.user_image_url);
        expect(ims.accessToken).to.equal(accessToken);
        expect(localStorage.getItem('nx-ims')).to.equal('true');
        expect(fetchStub.called).to.be.false;
      });
    });

    it('retains getIo as an IMS-backed avatar adapter without network requests', async () => {
      const { loadIms, getIo } = await loadModule();
      const ims = await loadIms();
      expect(await ims.getIo()).to.deep.equal({ user: { avatar: profile.user_image_url } });
      if (getIo) expect(await getIo()).to.deep.equal(await ims.getIo());
      expect(window.adobeIMS.getProfile.calledOnce).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('loads a profile without an avatar successfully', async () => {
      delete profile.user_image_url;
      const { loadIms } = await loadModule();
      const ims = await loadIms();
      expect(ims.user_image_url).to.be.undefined;
      expect((await ims.getIo()).user.avatar).to.be.undefined;
      expect(ims.displayName).to.equal(profile.displayName);
      expect(fetchStub.called).to.be.false;
    });

    it('reuses the loaded IMS profile', async () => {
      const { loadIms } = await loadModule();
      const [first, second] = await Promise.all([loadIms(), loadIms()]);
      expect(first).to.equal(second);
      expect(window.adobeIMS.getProfile.calledOnce).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('does not fetch a profile for an anonymous user', async () => {
      accessToken = null;
      const { loadIms } = await loadModule();
      expect(await loadIms()).to.deep.equal({ anonymous: true });
      expect(window.adobeIMS.getProfile.called).to.be.false;
      expect(localStorage.getItem('nx-ims')).to.be.null;
      expect(fetchStub.called).to.be.false;
    });

    it('keeps organization lookup authenticated against IMS', async () => {
      fetchStub.resolves({ ok: true, json: async () => (name === 'NX' ? [] : { data: [] }) });
      const { loadIms } = await loadModule();
      const ims = await loadIms();
      await ims.getOrgs();
      expect(fetchStub.calledOnce).to.be.true;
      const [url, opts] = fetchStub.firstCall.args;
      expect(url).to.include(name === 'NX' ? '/ims/organizations/v5?' : '/ims/account_cluster/v3?');
      expect(url).to.include('client_id=nexter');
      expect(opts.headers.Authorization).to.equal('Bearer test-token');
      expect(url).to.not.include('cc-collab');
    });
  });
});
