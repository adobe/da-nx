import { expect } from '@esm-bundle/chai';
import { buildGlaasCreateMetadata } from '../../../nx/blocks/loc/connectors/glaas/api.js';

describe('buildGlaasCreateMetadata', () => {
  it('omits aiContextConfig when there is no campaign brief', async () => {
    const { aiContextConfig, config } = await buildGlaasCreateMetadata({
      task: { name: 'task', businessUnit: 'acom' },
      service: {},
    });
    expect(aiContextConfig).to.equal(undefined);
    expect(config).to.deep.include({ key: 'businessUnit', value: 'acom' });
  });

  it('builds aiContextConfig as a sibling of config, with empty global config and '
    + 'per-locale langConfig arrays', async () => {
    const campaignBrief = {
      fr: { targetAudience: 'Marketing leaders.', toneAndRegister: 'Formal.' },
      de: { targetAudience: 'Marketing leaders.' },
    };
    const { aiContextConfig, config } = await buildGlaasCreateMetadata({
      task: { name: 'task', businessUnit: 'acom', campaignBrief },
      service: {},
    });

    expect(config.some((entry) => entry.key === 'brief')).to.equal(false);
    expect(aiContextConfig.config).to.deep.equal([]);
    expect(aiContextConfig.langConfig.fr).to.deep.equal([
      { key: 'targetAudience', value: 'Marketing leaders.' },
      { key: 'toneAndRegister', value: 'Formal.' },
    ]);
    expect(aiContextConfig.langConfig.de).to.deep.equal([
      { key: 'targetAudience', value: 'Marketing leaders.' },
    ]);
  });
});
