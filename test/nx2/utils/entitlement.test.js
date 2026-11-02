import { expect } from '@esm-bundle/chai';
import { isCmaEntitled, REQUIRED_SERVICE_CODES } from '../../../nx2/utils/entitlement.js';
import { resetMockIms, setMockIms } from '../../../nx2/test/mocks/ims.js';

describe('isCmaEntitled', () => {
  beforeEach(resetMockIms);
  afterEach(resetMockIms);

  it('returns false when the profile carries no projectedProductContext', async () => {
    expect(await isCmaEntitled()).to.be.false;
  });

  it('returns false when no entry matches a required service code', async () => {
    setMockIms({
      projectedProductContext: [{ prodCtx: { owningEntity: 'org-1', serviceCode: 'some_other_code' } }],
    });
    expect(await isCmaEntitled()).to.be.false;
  });

  REQUIRED_SERVICE_CODES.forEach((code) => {
    it(`returns true for an entry with the required service code "${code}"`, async () => {
      setMockIms({
        projectedProductContext: [{ prodCtx: { owningEntity: 'org-1', serviceCode: code } }],
      });
      expect(await isCmaEntitled()).to.be.true;
    });
  });

  it('returns true when at least one of several entries qualifies', async () => {
    setMockIms({
      projectedProductContext: [
        { prodCtx: { owningEntity: 'org-1', serviceCode: 'irrelevant' } },
        { prodCtx: { owningEntity: 'org-2', serviceCode: REQUIRED_SERVICE_CODES[0] } },
      ],
    });
    expect(await isCmaEntitled()).to.be.true;
  });

  it('ignores malformed entries (no prodCtx, non-string serviceCode) rather than throwing', async () => {
    setMockIms({
      projectedProductContext: [null, {}, { prodCtx: null }, { prodCtx: { serviceCode: 42 } }],
    });
    expect(await isCmaEntitled()).to.be.false;
  });

  it('returns false for an anonymous (signed-out) profile', async () => {
    setMockIms({ anonymous: true });
    expect(await isCmaEntitled()).to.be.false;
  });
});
