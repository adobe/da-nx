import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/loc/views/options/options.js';
import { clearConfigCache } from '../../../../nx/blocks/loc/utils/utils.js';

// Dynamic-expression import so the import-map plugin does not rewrite it.
const imsPath = '../../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

const VALID_SHEETS = {
  languages: { data: [{ name: 'French', code: 'fr', location: '/fr', actions: 'translate' }] },
  config: { data: [{ key: 'translation.service.name', value: 'google' }] },
};
const INVALID_SHEETS = {
  languages: { data: [] },
  config: { data: [{ key: 'translation.service.name', value: 'google' }] },
};

let origFetch;

/**
 * Creates an options element with no config loaded yet.
 * @returns {HTMLElement} The element.
 */
function createOptionsEl() {
  const el = document.createElement('nx-loc-options');
  el.project = { org: 'acme', site: 'site1', urls: [] };
  el.loadConnectorServiceOptions = async () => {};
  return el;
}

describe('NxLocOptions - formatOptions config gate', () => {
  beforeEach(() => {
    resetMockIms();
    clearConfigCache();
    origFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = origFetch;
    clearConfigCache();
  });

  it('blocks setup and surfaces the errors when the config is invalid', async () => {
    window.fetch = async () => new Response(JSON.stringify(INVALID_SHEETS), { status: 200 });
    const el = createOptionsEl();

    await el.formatOptions();

    expect(el._configErrors).to.have.length.greaterThan(0);
    expect(el._message.type).to.equal('error');
    expect(el._message.text).to.include('No languages are configured');
    expect(el._siteConfig).to.equal(undefined);
    expect(el._siteLangs).to.equal(undefined);
  });

  it('loads the config and leaves no errors when the config is valid', async () => {
    window.fetch = async () => new Response(JSON.stringify(VALID_SHEETS), { status: 200 });
    const el = createOptionsEl();

    await el.formatOptions();

    expect(el._configErrors).to.equal(undefined);
    expect(el._message).to.equal(undefined);
    expect(el._siteConfig.service.name).to.equal('google');
    expect(el._siteLangs.map((l) => l.code)).to.deep.equal(['fr']);
  });

  it('restores saved choices after filtering actions for the detected source', async () => {
    const sheets = {
      config: {
        data: [
          { key: 'translation.service.name', value: 'google' },
          { key: 'source.language', value: 'Global' },
          { key: 'source.language.detect', value: 'true' },
          { key: 'rollout.conflict.behavior', value: 'overwrite, merge' },
        ],
      },
      languages: {
        data: [
          { name: 'Global', code: 'en', location: '/global', actions: 'rollout' },
          { name: 'Europe', code: 'eu', location: '/eu', actions: 'translate, rollout' },
          {
            name: 'French', code: 'fr', location: '/fr', source: '/eu', actions: 'translate, rollout', locales: '/fr-fr, /fr-be',
          },
        ],
      },
    };
    window.fetch = async () => new Response(JSON.stringify(sheets), { status: 200 });
    const el = createOptionsEl();
    Object.assign(el.project, {
      urls: [{ suppliedPath: '/eu/home' }],
      detectedSource: { name: 'Europe', code: 'eu', location: '/eu' },
      options: { 'rollout.conflict.behavior': 'merge', 'translation.service.all.env': 'stage' },
      langs: [
        { code: 'eu', action: 'translate' },
        { code: 'fr', action: 'rollout', locales: [{ code: '/fr-be' }] },
      ],
    });

    await el.formatOptions();

    expect(el._siteLangs.map((lang) => [lang.code, lang.activeAction.value]))
      .to.deep.equal([['eu', 'skip'], ['fr', 'rollout']]);
    expect(el._options['source.language']).to.deep.equal(el.project.detectedSource);
    expect(el._options['rollout.conflict.behavior']).to.equal('merge');
    expect(el._options.service.env).to.equal('stage');
    expect(el._langs[0].locales).to.deep.equal([{ code: '/fr-be', active: true }]);
  });
});
