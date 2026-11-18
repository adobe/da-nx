import { expect } from '@esm-bundle/chai';
import { resolveChatBases } from '../../../../../nx2/blocks/chat-ao/utils/endpoints.js';
import {
  CMA_BRIDGE_HTTP_BASE, CMA_BRIDGE_WS_BASE, AO_HTTP_BASE, AO_WS_BASE,
} from '../../../../../nx2/blocks/chat-ao/ao-constants.js';

describe('resolveChatBases', () => {
  it('returns the CMA bridge bases for the cma harness', () => {
    expect(resolveChatBases({ harness: 'cma' })).to.deep.equal({
      httpBase: CMA_BRIDGE_HTTP_BASE,
      wsBase: CMA_BRIDGE_WS_BASE,
    });
  });

  it('returns the default AO bases for coworker when no region is resolvable', () => {
    expect(resolveChatBases({ harness: 'coworker' })).to.deep.equal({
      httpBase: AO_HTTP_BASE,
      wsBase: AO_WS_BASE,
    });
  });

  it('returns the region-aware AO bases from the IMS profile for coworker', () => {
    const projectedProductContext = [{
      prodCtx: {
        statusCode: 'ACTIVE',
        serviceCode: 'acp',
        fulfillable_data: JSON.stringify({ region: 'VA6', environment: 'Prod' }),
      },
    }];
    expect(resolveChatBases({ harness: 'coworker', projectedProductContext })).to.deep.equal({
      httpBase: 'https://agent-orchestrator-prod-va6.adobe.io',
      wsBase: 'wss://agent-orchestrator-prod-va6.adobe.io',
    });
  });
});
