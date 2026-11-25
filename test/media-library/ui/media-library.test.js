import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../nx/blocks/media-library/media-library.js';
import { getAppState, updateAppState } from '../../../nx/blocks/media-library/core/state.js';

describe('media-library startup', () => {
  let el;
  let originalState;
  let originalFetch;
  let originalImsSession;
  let originalHref;

  beforeEach(() => {
    originalState = getAppState();
    originalFetch = window.fetch;
    originalImsSession = localStorage.getItem('nx-ims');
    originalHref = window.location.href;
    window.history.replaceState({}, '', '/apps/media-library#/org/site');
    el = document.createElement('nx-media-library');
    el.sitePath = '/org/site';
  });

  afterEach(() => {
    el.remove();
    window.history.replaceState({}, '', originalHref);
    window.fetch = originalFetch;
    if (originalImsSession === null) {
      localStorage.removeItem('nx-ims');
    } else {
      localStorage.setItem('nx-ims', originalImsSession);
    }
    updateAppState(originalState);
    sinon.restore();
  });

  it('resolves a deep-linked preview before processed library data is ready', () => {
    const media = { url: '/media_test.jpg', type: 'image' };
    window.history.replaceState({}, '', '/apps/media-library?media=%2Fmedia_test.jpg#/org/site');
    const modal = { show: sinon.spy() };
    const context = {
      _hasHydrated: false,
      siteAuthInfo: { requiresAuth: true },
      shadowRoot: { querySelector: () => modal },
    };
    updateAppState({
      selectedMediaKey: null, mediaData: [], progressiveMediaData: [], org: 'org', repo: 'site',
    });
    el._attemptModalResolution.call(context, { mediaData: [media], referencesLoading: true });
    expect(modal.show.calledOnce).to.equal(true);
    expect(modal.show.firstCall.args[0]).to.include({
      media, referencesLoading: true, usePreviewDaLive: true,
    });
    expect(modal.show.firstCall.args[0].usageData).to.equal(undefined);
  });

  it('updates an open preview when its references become ready', () => {
    const media = { url: '/media_test.jpg', type: 'image' };
    const usageData = [{ ...media, doc: '/page.md' }];
    const modal = {
      media,
      referencesLoading: true,
      show: sinon.spy(),
      shadowRoot: { querySelector: () => ({ open: true }) },
    };
    const context = { shadowRoot: { querySelector: () => modal } };
    updateAppState({
      selectedMediaKey: '/media_test.jpg',
      mediaData: [media],
      usageIndex: new Map([['/media_test.jpg', usageData]]),
    });
    el._attemptModalResolution.call(context);
    expect(modal.referencesLoading).to.equal(false);
    expect(modal.usageData).to.equal(usageData);
    expect(modal.show.called).to.equal(false);
  });

  it('keeps loading instead of showing site-not-found during sign-in redirect', async () => {
    localStorage.removeItem('nx-ims');
    window.fetch = sinon.stub().resolves(new Response(null, { status: 401 }));
    await el.initialize();
    expect(getAppState().isValidating).to.equal(true);
    expect(getAppState().validationError).to.equal(null);
  });
});
