import { expect } from '@esm-bundle/chai';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import '../../nx/blocks/loc/views/actions/actions.js';
import '../../nx/blocks/loc/views/options/options.js';

const translateConfig = {
  config: {
    data: [
      { key: 'translation.service.name', value: 'Google' },
      { key: 'translation.service.all.env', value: 'prod, stage' },
      { key: 'translation.service.prod.origin', value: 'https://translate.example.com/prod' },
      { key: 'translation.service.stage.origin', value: 'https://translate.example.com/stage' },
      { key: 'rollout.conflict.behavior', value: 'overwrite, merge' },
    ],
  },
  languages: {
    data: [
      { name: 'English', code: 'en', location: '/en', actions: 'Rollout, Skip', locales: '/gb/en' },
      { name: 'German', code: 'de', location: '/de', actions: 'Translate, Rollout, Skip', locales: '/at/de, /ch/de' },
    ],
  },
};

const baseProject = {
  org: 'org',
  site: 'site',
  view: 'options',
  urls: [{ suppliedPath: '/en/page', basePath: '/page' }],
};

async function waitFor(check, timeout = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for the options view');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
}

async function renderOptions(project) {
  const el = document.createElement('nx-loc-options');
  el.project = project;
  document.body.append(el);
  await waitFor(() => el.shadowRoot?.querySelector('sl-select[name="lang-de-action"]'));
  await el.updateComplete;
  return el;
}

const selectValue = (el, name) => el.shadowRoot
  .querySelector(`sl-select[name="${name}"]`)
  .getAttribute('value');
const activeLocales = (el) => [...el.shadowRoot.querySelectorAll('.locale-list li.active span')]
  .map((span) => span.textContent);

describe('nx-loc-options', () => {
  let originalFetch;
  let el;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = window.fetch;
    window.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/.da/translate.json')) return new Response(JSON.stringify(translateConfig));
      return new Response('{}', { status: 404 });
    };
  });

  afterEach(() => {
    el?.remove();
    window.fetch = originalFetch;
  });

  it('starts a new project with the first action of each language', async () => {
    el = await renderOptions({ ...baseProject });
    expect(selectValue(el, 'lang-en-action')).to.equal('rollout');
    expect(selectValue(el, 'lang-de-action')).to.equal('translate');
    expect(selectValue(el, 'rollout.conflict.behavior')).to.equal('overwrite');
  });

  it('shows the choices saved on an earlier visit', async () => {
    el = await renderOptions({
      ...baseProject,
      options: { 'rollout.conflict.behavior': 'merge', 'translation.service.all.env': 'stage' },
      langs: [{ name: 'German', code: 'de', location: '/de', action: 'rollout', locales: [{ code: '/ch/de', active: true }] }],
    });

    expect(selectValue(el, 'lang-en-action')).to.equal('skip');
    expect(selectValue(el, 'lang-de-action')).to.equal('rollout');
    expect(activeLocales(el)).to.deep.equal(['ch/de']);
    expect(selectValue(el, 'rollout.conflict.behavior')).to.equal('merge');
    expect(selectValue(el, 'translation.service.all.env')).to.equal('stage');
  });

  it('keeps the saved choices when the project moves on', async () => {
    el = await renderOptions({
      ...baseProject,
      options: { 'rollout.conflict.behavior': 'merge' },
      langs: [{ name: 'German', code: 'de', location: '/de', action: 'translate', locales: [{ code: '/at/de', active: true }] }],
    });

    const { updates } = el.updateOptions();
    expect(updates.langs.map((lang) => [lang.code, lang.action])).to.deep.equal([['de', 'translate']]);
    expect(updates.langs[0].locales.map((locale) => locale.code)).to.deep.equal(['/at/de']);
    expect(updates.options['rollout.conflict.behavior']).to.equal('merge');
  });
});
