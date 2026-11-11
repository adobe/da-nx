import { expect } from '@esm-bundle/chai';
import { sortLangs } from '../../../../nx/blocks/loc/views/rollout/index.js';

describe('sortLangs', () => {
  it('Keeps languages that have locales', () => {
    const langs = [{ name: 'English', action: 'rollout', locales: [{ code: '/en-ca', active: true }] }];
    const [lang] = sortLangs(langs);
    expect(lang.name).to.equal('English');
    expect(lang.expand).to.be.true;
    expect(lang.rollout).to.deep.equal({ status: 'not started' });
  });

  it('Skips languages with no locales configured', () => {
    const langs = [
      { name: 'German', action: 'translate' },
      { name: 'French', action: 'translate', locales: [] },
      { name: 'Spanish', action: 'translate', locales: [{ code: '/es-mx', active: true }] },
    ];
    expect(sortLangs(langs).map((lang) => lang.name)).to.deep.equal(['Spanish']);
  });

  it('Skips languages whose translation was cancelled', () => {
    const langs = [{
      name: 'Spanish',
      action: 'translate',
      locales: [{ code: '/es-mx', active: true }],
      translation: { status: 'cancelled' },
    }];
    expect(sortLangs(langs)).to.deep.equal([]);
  });
});
