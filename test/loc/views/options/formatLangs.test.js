import { expect } from '@esm-bundle/chai';
import { formatLangs, finalizeOptions } from '../../../../nx/blocks/loc/views/options/utils/utils.js';

const config = { 'source.language': 'English' };

describe('formatLangs - locales', () => {
  it('Parses a comma-separated string into active locale objects', () => {
    const [lang] = formatLangs([{ name: 'German', actions: 'translate', locales: '/de, /at' }], config);
    expect(lang.locales).to.deep.equal([
      { code: '/de', active: true },
      { code: '/at', active: true },
    ]);
  });

  it('Marks only the default locales active when default locales is set', () => {
    const langs = [{ name: 'German', actions: 'translate', locales: '/de, /at', 'default locales': '/de' }];
    const [lang] = formatLangs(langs, config);
    expect(lang.locales.map((l) => l.active)).to.deep.equal([true, false]);
  });

  it('Removes locales when the sheet value is an empty string', () => {
    const [lang] = formatLangs([{ name: 'English', actions: 'rollout', locales: '' }], config);
    expect(lang.locales).to.be.undefined;
    expect('locales' in lang).to.be.false;
  });

  it('Keeps parsed locales when formatLangs runs again on the same rows', () => {
    const langs = [{ name: 'German', actions: 'translate', locales: '/de, /at' }];
    formatLangs(langs, config);
    const [lang] = formatLangs(langs, config);
    expect(lang.locales).to.deep.equal([
      { code: '/de', active: true },
      { code: '/at', active: true },
    ]);
  });

  it('Leaves locales undefined when the sheet has no locales column', () => {
    const [lang] = formatLangs([{ name: 'English', actions: 'rollout' }], config);
    expect(lang.locales).to.be.undefined;
  });
});

describe('finalizeOptions - locales', () => {
  const options = { 'translation.service.all.env': 'prod', 'source.language': { location: '/' } };
  const suppliedConfig = { service: { name: 'Google', envs: { prod: {} } } };

  it('Keeps only active locales', () => {
    const langs = formatLangs([
      { name: 'German', actions: 'translate', locales: '/de, /at', 'default locales': '/de' },
    ], config);
    const result = finalizeOptions(suppliedConfig, options, langs, []);
    expect(result.langs[0].locales).to.deep.equal([{ code: '/de', active: true }]);
  });

  it('Does not throw for a language with an empty locales value', () => {
    const langs = formatLangs([{ name: 'English', actions: 'rollout', locales: '' }], config);
    const result = finalizeOptions(suppliedConfig, options, langs, []);
    expect(result.langs[0].locales).to.be.undefined;
  });
});
