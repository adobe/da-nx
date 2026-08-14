import { expect } from '@esm-bundle/chai';
import {
  isEWEnabled,
  isEWUserEnabled,
  setEWUserEnabled,
} from '../../../../utils/ewFlags.js';

const EW_USER_KEY = 'nx2:ew-user-enabled';

describe('ewFlags user-level override', () => {
  beforeEach(() => {
    localStorage.removeItem(EW_USER_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(EW_USER_KEY);
  });

  it('isEWUserEnabled defaults to false when unset', () => {
    expect(isEWUserEnabled()).to.equal(false);
  });

  it('setEWUserEnabled(true) writes and setEWUserEnabled(false) removes', () => {
    setEWUserEnabled(true);
    expect(localStorage.getItem(EW_USER_KEY)).to.equal('true');
    expect(isEWUserEnabled()).to.equal(true);

    setEWUserEnabled(false);
    expect(localStorage.getItem(EW_USER_KEY)).to.equal(null);
    expect(isEWUserEnabled()).to.equal(false);
  });

  // The user override intentionally short-circuits before the network call
  // to fetchDaConfigs — test with an obviously bogus org/site so a failed
  // fetch would surface as a rejection rather than a false positive.
  it('isEWEnabled returns true when user toggle is on, regardless of site config', async () => {
    setEWUserEnabled(true);
    const result = await isEWEnabled({ org: '__ewflags_test_never_hit__', site: '__nope__' });
    expect(result).to.equal(true);
  });
});
