import { expect } from '@esm-bundle/chai';
import {
  getOrgId, resolveAoHttpBase, resolveAoWsBase, resolveSkillsHttpBase,
} from '../../../../../nx2/blocks/chat-ao/utils/uploads.js';
import {
  AO_HTTP_BASE, AO_WS_BASE, CMA_BRIDGE_WS_BASE, CMA_BRIDGE_HTTP_BASE,
} from '../../../../../nx2/blocks/chat-ao/ao-constants.js';

function withActiveTartan(fulfillableData) {
  return [
    { prodCtx: { serviceCode: 'dma_app_builder', statusCode: 'ACTIVE' } },
    {
      prodCtx: {
        serviceCode: 'dma_tartan',
        statusCode: 'ACTIVE',
        fulfillable_data: JSON.stringify(fulfillableData),
      },
    },
  ];
}

describe('uploads.js getOrgId', () => {
  it('returns the owningEntity from the entry that has one', () => {
    const ctx = [{ prodCtx: { serviceCode: 'x' } }, { prodCtx: { owningEntity: 'org1' } }];
    expect(getOrgId(ctx)).to.equal('org1');
  });

  it('returns undefined when there is no projectedProductContext', () => {
    expect(getOrgId(undefined)).to.equal(undefined);
  });
});

describe('uploads.js resolveAoHttpBase/resolveAoWsBase', () => {
  it('falls back to the default base when there is no projectedProductContext', () => {
    expect(resolveAoHttpBase(undefined)).to.equal(AO_HTTP_BASE);
    expect(resolveAoWsBase(undefined)).to.equal(AO_WS_BASE);
  });

  it('falls back to the default base when no entry is ACTIVE acp/dma_tartan', () => {
    const ctx = [{ prodCtx: { serviceCode: 'dma_app_builder', statusCode: 'ACTIVE' } }];
    expect(resolveAoHttpBase(ctx)).to.equal(AO_HTTP_BASE);
  });

  it('falls back to the default base when the matching entry is not ACTIVE', () => {
    const ctx = [{
      prodCtx: {
        serviceCode: 'dma_tartan',
        statusCode: 'INACTIVE',
        fulfillable_data: JSON.stringify({ region: 'EU1', environment: 'PROD' }),
      },
    }];
    expect(resolveAoHttpBase(ctx)).to.equal(AO_HTTP_BASE);
  });

  it('falls back to the default base when fulfillable_data is missing region/environment', () => {
    const ctx = withActiveTartan({ tenant_id: 'sitesinternal' });
    expect(resolveAoHttpBase(ctx)).to.equal(AO_HTTP_BASE);
  });

  it('falls back to the default base when fulfillable_data is malformed JSON', () => {
    const ctx = [{
      prodCtx: { serviceCode: 'dma_tartan', statusCode: 'ACTIVE', fulfillable_data: 'not json' },
    }];
    expect(resolveAoHttpBase(ctx)).to.equal(AO_HTTP_BASE);
  });

  it('builds the region-specific https/wss base from an ACTIVE dma_tartan entry, lowercased', () => {
    const ctx = withActiveTartan({ region: 'VA7', environment: 'PROD' });
    expect(resolveAoHttpBase(ctx)).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
    expect(resolveAoWsBase(ctx)).to.equal('wss://agent-orchestrator-prod-va7.adobe.io');
  });

  it('resolves a non-default region/environment (e.g. EU stage)', () => {
    const ctx = withActiveTartan({ region: 'EU1', environment: 'STAGE' });
    expect(resolveAoHttpBase(ctx)).to.equal('https://agent-orchestrator-stage-eu1.adobe.io');
    expect(resolveAoWsBase(ctx)).to.equal('wss://agent-orchestrator-stage-eu1.adobe.io');
  });

  it('matches on an ACTIVE acp entry too, not just dma_tartan', () => {
    const ctx = [{
      prodCtx: {
        serviceCode: 'acp',
        statusCode: 'ACTIVE',
        fulfillable_data: JSON.stringify({ region: 'VA7', environment: 'PROD' }),
      },
    }];
    expect(resolveAoHttpBase(ctx)).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
  });
});

describe('uploads.js alt-harness activation key', () => {
  it('routes the WS base to the CMA bridge when an activation key is present', () => {
    const ctx = withActiveTartan({ region: 'VA7', environment: 'PROD' });
    expect(resolveAoWsBase(ctx, { altHarnessKey: 'some-key' })).to.equal(CMA_BRIDGE_WS_BASE);
    // HTTP/REST (episodes, history, uploads) stays on AO - the bridge is WS-only.
    expect(resolveAoHttpBase(ctx)).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
  });

  it('leaves the WS base on Agent Orchestrator when no key is present', () => {
    const ctx = withActiveTartan({ region: 'VA7', environment: 'PROD' });
    expect(resolveAoWsBase(ctx, {})).to.equal('wss://agent-orchestrator-prod-va7.adobe.io');
    expect(resolveAoWsBase(ctx, { altHarnessKey: '' })).to.equal('wss://agent-orchestrator-prod-va7.adobe.io');
  });

  it('falls back to the default WS base with a key but no region context', () => {
    expect(resolveAoWsBase(undefined, { altHarnessKey: 'some-key' })).to.equal(CMA_BRIDGE_WS_BASE);
    expect(resolveAoWsBase(undefined)).to.equal(AO_WS_BASE);
  });

  it('routes the skills HTTP base to the bridge with a key, but to AO without one', () => {
    const ctx = withActiveTartan({ region: 'VA7', environment: 'PROD' });
    expect(resolveSkillsHttpBase(ctx, { altHarnessKey: 'some-key' })).to.equal(CMA_BRIDGE_HTTP_BASE);
    expect(resolveSkillsHttpBase(ctx, {})).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
    expect(resolveSkillsHttpBase(ctx, { altHarnessKey: '' })).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
    expect(resolveSkillsHttpBase(undefined)).to.equal(AO_HTTP_BASE);
  });
});
