import { expect } from '@esm-bundle/chai';
import { isAllowedDaLiveOrigin } from '../../nx/utils/allowed-da-live-origins.js';

describe('isAllowedDaLiveOrigin', () => {
  it('allows the production da.live origin', () => {
    expect(isAllowedDaLiveOrigin('https://da.live')).to.be.true;
  });

  it('allows local dev origins', () => {
    expect(isAllowedDaLiveOrigin('http://localhost:3000')).to.be.true;
    expect(isAllowedDaLiveOrigin('https://localhost')).to.be.true;
  });

  it('allows a da-live branch preview/live origin', () => {
    expect(isAllowedDaLiveOrigin('https://valapi--da-live--adobe.aem.page')).to.be.true;
    expect(isAllowedDaLiveOrigin('https://valapi--da-live--adobe.aem.live')).to.be.true;
  });

  it('rejects an origin for a different repo or owner', () => {
    expect(isAllowedDaLiveOrigin('https://valapi--da-live--someoneelse.aem.live')).to.be.false;
    expect(isAllowedDaLiveOrigin('https://valapi--other-repo--adobe.aem.live')).to.be.false;
  });

  it('rejects a plain http branch origin', () => {
    expect(isAllowedDaLiveOrigin('http://valapi--da-live--adobe.aem.live')).to.be.false;
  });

  it('rejects an unrelated origin', () => {
    expect(isAllowedDaLiveOrigin('https://evil.example.com')).to.be.false;
  });
});
