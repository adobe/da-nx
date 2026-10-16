import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx/scripts/nexter.js';
import { setMockIms, resetMockIms } from '../../../../nx2/test/mocks/ims.js';

// Configure before importing the component, which captures getConfig() at module load.
// The runner's scoped import map supplies the shared IMS mock only to this block.
const config = setConfig({ imsClientId: 'nexter' });
// Test-runner import-map query parameters must not become part of asset URLs.
config.nxBase = `${window.location.origin}/nx`;
await import('../../../../nx/blocks/profile/profile.js');

async function createProfile() {
  const el = document.createElement('nx-profile');
  const loaded = new Promise((resolve) => {
    el.addEventListener('loaded', resolve, { once: true });
  });
  document.body.append(el);
  await loaded;
  await el.updateComplete;
  return el;
}

describe('legacy nx-profile avatars', () => {
  let restoreFetch;

  beforeEach(() => {
    setMockIms({ orgs: {} });
  });

  afterEach(() => {
    restoreFetch?.();
    resetMockIms();
    document.querySelectorAll('nx-profile').forEach((el) => el.remove());
  });

  it('uses the IMS avatar for both profile images without fetching CC Collab', async () => {
    const avatar = '/nx/img/favicons/favicon.ico';
    setMockIms({ userImageUrl: avatar });
    const originalFetch = window.fetch;
    const requests = [];
    window.fetch = async (url, opts) => {
      requests.push(String(url));
      return originalFetch.call(window, url, opts);
    };
    restoreFetch = () => { window.fetch = originalFetch; };

    const el = await createProfile();
    const images = [...el.shadowRoot.querySelectorAll('img')];
    expect(images).to.have.length(2);
    images.forEach((img) => expect(img.getAttribute('src')).to.equal(avatar));
    expect(requests.some((url) => url.includes('cc-collab'))).to.be.false;
  });

  [undefined, null, ''].forEach((userImageUrl) => {
    it(`uses the default icon when the IMS avatar is ${String(userImageUrl)}`, async () => {
      setMockIms({ userImageUrl });
      const el = await createProfile();
      const images = [...el.shadowRoot.querySelectorAll('img')];
      expect(images).to.have.length(2);
      images.forEach((img) => {
        expect(new URL(img.src).pathname).to.equal('/nx/public/icons/S2_Icon_User_20_N.svg');
      });
    });
  });

  [0, 1].forEach((imageIndex) => {
    it(`falls back for both images when profile image ${imageIndex} fails`, async () => {
      setMockIms({ userImageUrl: '/nx/img/favicons/favicon.ico' });
      const el = await createProfile();

      el.shadowRoot.querySelectorAll('img')[imageIndex].dispatchEvent(new Event('error'));
      await el.updateComplete;

      el.shadowRoot.querySelectorAll('img').forEach((img) => {
        expect(new URL(img.src).pathname).to.equal('/nx/public/icons/S2_Icon_User_20_N.svg');
      });

      el.shadowRoot.querySelectorAll('img')[imageIndex].dispatchEvent(new Event('error'));
      expect(await el.updateComplete).to.be.true;
    });
  });

  it('shows only the sign-in button for anonymous users', async () => {
    setMockIms({ anonymous: true });
    const el = await createProfile();
    expect(el.shadowRoot.querySelector('.nx-btn-signin')).to.not.be.null;
    expect(el.shadowRoot.querySelector('img')).to.be.null;
  });
});
