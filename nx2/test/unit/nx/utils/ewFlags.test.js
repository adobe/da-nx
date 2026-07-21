import { expect } from '@esm-bundle/chai';
import {
  isEWEnabled,
  isEWUserEnabled,
  setEWUserEnabled,
  armEwWelcome,
  isEwWelcomePending,
  consumeEwWelcome,
} from '../../../../utils/ewFlags.js';

const EW_USER_KEY = 'nx2:ew-user-enabled';
const EW_WELCOME_PENDING_KEY = 'nx2:ew-welcome-pending';
const EW_WELCOME_SEEN_KEY = 'nx2:ew-welcome-seen';

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

describe('ewFlags welcome guide', () => {
  beforeEach(() => {
    localStorage.removeItem(EW_WELCOME_PENDING_KEY);
    localStorage.removeItem(EW_WELCOME_SEEN_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(EW_WELCOME_PENDING_KEY);
    localStorage.removeItem(EW_WELCOME_SEEN_KEY);
  });

  it('isEwWelcomePending defaults to false when unset', () => {
    expect(isEwWelcomePending()).to.equal(false);
  });

  it('armEwWelcome sets the pending flag', () => {
    armEwWelcome();
    expect(isEwWelcomePending()).to.equal(true);
  });

  it('consumeEwWelcome clears pending and permanently marks seen', () => {
    armEwWelcome();
    consumeEwWelcome();
    expect(isEwWelcomePending()).to.equal(false);
    expect(localStorage.getItem(EW_WELCOME_SEEN_KEY)).to.equal('true');
  });

  it('armEwWelcome is a no-op once the guide has been seen', () => {
    armEwWelcome();
    consumeEwWelcome();
    armEwWelcome();
    expect(isEwWelcomePending()).to.equal(false);
  });
});
