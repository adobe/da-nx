import { expect } from '@esm-bundle/chai';
import { isCmaEntitled, isCmaHarness, REQUIRED_SERVICE_CODES } from '../../../nx2/utils/entitlement.js';
import { resetMockIms, setMockIms } from '../../../nx2/test/mocks/ims.js';
import { installFetch, restoreFetch } from '../../../nx2/test/mocks/fetch.js';

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

  it('returns true when the SELECTED tenant (first entry with an owningEntity) qualifies', async () => {
    setMockIms({
      projectedProductContext: [
        { prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[0] } },
        { prodCtx: { owningEntity: 'org-2', serviceCode: 'irrelevant' } },
      ],
    });
    expect(await isCmaEntitled()).to.be.true;
  });

  it('returns false when a LATER entry qualifies but the selected (first owningEntity) one does not '
    + '— getOrgId would send the unentitled org as x-tenant-id, which the bridge rejects', async () => {
    setMockIms({
      projectedProductContext: [
        { prodCtx: { owningEntity: 'org-1', serviceCode: 'irrelevant' } },
        { prodCtx: { owningEntity: 'org-2', serviceCode: REQUIRED_SERVICE_CODES[0] } },
      ],
    });
    expect(await isCmaEntitled()).to.be.false;
  });

  it('skips entries with no owningEntity when selecting the tenant to check, matching getOrgId', async () => {
    setMockIms({
      projectedProductContext: [
        { prodCtx: { serviceCode: REQUIRED_SERVICE_CODES[0] } },
        { prodCtx: { owningEntity: 'org-2', serviceCode: REQUIRED_SERVICE_CODES[1] } },
      ],
    });
    expect(await isCmaEntitled()).to.be.true;
  });

  it('returns true when a LATER entry for the SAME selected org qualifies, even if earlier entries '
    + 'for that org do not — IMS emits one entry per product, not per org, so a profile with many '
    + 'entries for one org (most not CMA-related) must still check all of them', async () => {
    setMockIms({
      projectedProductContext: [
        { prodCtx: { owningEntity: 'org-1', serviceCode: 'dma_aem_cloud' } },
        { prodCtx: { owningEntity: 'org-1', serviceCode: 'workfront' } },
        { prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[1] } },
        { prodCtx: { owningEntity: 'org-1', serviceCode: 'dma_audiencemanager_int' } },
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

describe('isCmaHarness', () => {
  const entitle = () => setMockIms({
    projectedProductContext: [{ prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[0] } }],
  });
  const coworker = (value) => installFetch({
    body: JSON.stringify({ flags: { data: value ? [{ key: 'ew.coworker', value }] : [] } }),
  });

  beforeEach(resetMockIms);
  afterEach(() => {
    resetMockIms();
    restoreFetch();
  });

  it('is true for ew.coworker=cma when entitled', async () => {
    entitle();
    coworker('cma');
    expect(await isCmaHarness({ org: 'h-org1', site: 'h-site1' })).to.be.true;
  });

  it('is false for ew.coworker=cma when not entitled', async () => {
    coworker('cma');
    expect(await isCmaHarness({ org: 'h-org2', site: 'h-site2' })).to.be.false;
  });

  it('is false for ew.coworker=true even when entitled', async () => {
    entitle();
    coworker('true');
    expect(await isCmaHarness({ org: 'h-org3', site: 'h-site3' })).to.be.false;
  });

  it('is false when ew.coworker is unset even when entitled', async () => {
    entitle();
    coworker();
    expect(await isCmaHarness({ org: 'h-org4', site: 'h-site4' })).to.be.false;
  });
});
