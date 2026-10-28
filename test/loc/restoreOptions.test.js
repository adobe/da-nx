import { expect } from '@esm-bundle/chai';
import * as utils from '../../nx/blocks/loc/views/options/utils/utils.js';

const config = {
  'rollout.conflict.behavior': 'overwrite, merge',
  'translation.service.all.env': 'prod, stage',
};

function getLangs() {
  return utils.formatLangs([
    { name: 'English', code: 'en', location: '/en', actions: 'Rollout, Skip', locales: '/gb/en, /us/en' },
    { name: 'German', code: 'de', location: '/de', actions: 'Translate, Rollout, Skip', locales: '/at/de, /ch/de' },
    { name: 'French', code: 'fr', location: '/fr', actions: 'Translate' },
  ], config);
}

const actions = (langs) => langs.map((lang) => `${lang.code}:${lang.activeAction.value}`);
const activeLocales = (lang) => lang.locales
  .filter((locale) => locale.active)
  .map((locale) => locale.code);

describe('restoreLangs', () => {
  it('keeps the config defaults when nothing was saved', () => {
    const langs = utils.restoreLangs({ langs: getLangs(), savedLangs: undefined });
    expect(actions(langs)).to.deep.equal(['en:rollout', 'de:translate', 'fr:translate']);
  });

  it('restores saved actions and sets languages that were not saved to skip', () => {
    const savedLangs = [{ name: 'German', code: 'de', action: 'rollout', locales: [{ code: '/at/de', active: true }] }];
    const langs = utils.restoreLangs({ langs: getLangs(), savedLangs });
    expect(actions(langs)).to.deep.equal(['en:skip', 'de:rollout', 'fr:skip']);
  });

  it('falls back to skip when the config no longer offers the saved action', () => {
    const savedLangs = [{ name: 'French', code: 'fr', action: 'copy' }];
    const langs = utils.restoreLangs({ langs: getLangs(), savedLangs });
    expect(actions(langs)).to.deep.equal(['en:skip', 'de:skip', 'fr:skip']);
  });

  it('restores the saved locale selection', () => {
    const savedLangs = [
      { code: 'en', action: 'rollout', locales: [] },
      { code: 'de', action: 'translate', locales: [{ code: '/ch/de', active: true }] },
    ];
    const [en, de] = utils.restoreLangs({ langs: getLangs(), savedLangs });
    expect(activeLocales(en)).to.deep.equal([]);
    expect(activeLocales(de)).to.deep.equal(['/ch/de']);
  });

  it('keeps the config locale defaults when the saved language has no locales', () => {
    const savedLangs = [{ code: 'de', action: 'translate' }];
    const [, de] = utils.restoreLangs({ langs: getLangs(), savedLangs });
    expect(activeLocales(de)).to.deep.equal(['/at/de', '/ch/de']);
  });

  it('does not change the languages it was given', () => {
    const langs = getLangs();
    const savedLangs = [{ code: 'en', action: 'rollout', locales: [] }];
    utils.restoreLangs({ langs, savedLangs });
    expect(actions(langs)).to.deep.equal(['en:rollout', 'de:translate', 'fr:translate']);
    expect(activeLocales(langs[0])).to.deep.equal(['/gb/en', '/us/en']);
  });
});

describe('restoreOptions', () => {
  const options = {
    'sync.conflict.behavior': 'overwrite',
    'rollout.conflict.behavior': 'overwrite',
    'translation.service.all.env': 'prod',
    'source.language': { name: 'English', code: 'en', location: '/en' },
  };

  it('keeps the config defaults when nothing was saved', () => {
    const restored = utils.restoreOptions({ options, savedOptions: undefined, config });
    expect(restored).to.deep.equal(options);
  });

  it('restores saved conflict behaviors and environment', () => {
    const savedOptions = {
      'sync.conflict.behavior': 'merge',
      'rollout.conflict.behavior': 'merge',
      'translation.service.all.env': 'stage',
    };
    const restored = utils.restoreOptions({ options, savedOptions, config });
    expect(restored['sync.conflict.behavior']).to.equal('merge');
    expect(restored['rollout.conflict.behavior']).to.equal('merge');
    expect(restored['translation.service.all.env']).to.equal('stage');
  });

  it('ignores saved values the config no longer offers', () => {
    const savedOptions = { 'translation.service.all.env': 'dev', 'rollout.conflict.behavior': 'keep' };
    const restored = utils.restoreOptions({ options, savedOptions, config });
    expect(restored['translation.service.all.env']).to.equal('prod');
    expect(restored['rollout.conflict.behavior']).to.equal('overwrite');
  });

  it('only restores conflict behaviors and environment', () => {
    const savedOptions = {
      'source.language': { name: 'German', code: 'de', location: '/de' },
      service: { name: 'Google', env: 'prod' },
    };
    const restored = utils.restoreOptions({ options, savedOptions, config });
    expect(restored['source.language']).to.deep.equal(options['source.language']);
    expect(restored.service).to.be.undefined;
  });

  it('does not change the options it was given', () => {
    const given = { ...options };
    const savedOptions = { 'rollout.conflict.behavior': 'merge' };
    utils.restoreOptions({ options: given, savedOptions, config });
    expect(given).to.deep.equal(options);
  });
});
