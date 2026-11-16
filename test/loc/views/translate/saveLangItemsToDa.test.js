import { expect } from '@esm-bundle/chai';
import { saveLangItemsToDa } from '../../../../nx/blocks/loc/views/translate/index.js';

const URLS = [{ basePath: '/a', suppliedPath: '/a' }, { basePath: '/b', suppliedPath: '/b' }];

function setup({ concurrency, failLangs = [], throwLangs = [] } = {}) {
  const events = [];
  const langs = ['fr', 'de', 'es'].map((code) => ({
    code,
    name: code.toUpperCase(),
    location: `/${code}`,
    translation: { status: 'translated' },
  }));
  const connector = {
    saveItems: async ({ lang, urls }) => {
      events.push(`save:${lang.code}`);
      if (throwLangs.includes(lang.code)) throw new Error(`${lang.code} failed`);
      return urls.map((url, i) => ({
        ...url,
        status: failLangs.includes(lang.code) && i === 0 ? 'error' : 'success',
        error: failLangs.includes(lang.code) && i === 0 ? '500' : undefined,
      }));
    },
  };
  if (concurrency) connector.saveLangConcurrency = concurrency;
  const conf = {
    org: 'org',
    site: 'site',
    title: 'Project',
    urls: URLS,
    langs,
    sourceLocations: ['/'],
    actions: {
      saveState: async (props, options) => {
        events.push(`state:${options?.waitForSave}:${langs.map((l) => l.translation.status).join(',')}`);
      },
    },
  };
  return { conf, connector, events, langs };
}

const save = ({ conf, connector }) => saveLangItemsToDa(
  { 'translate.conflict.behavior': 'overwrite' },
  conf,
  connector,
  () => {},
);

describe('saveLangItemsToDa', () => {
  it('saves project state after each language by default', async () => {
    const ctx = setup();
    const result = await save(ctx);

    expect(result).to.deep.equal({ errors: [] });
    expect(ctx.events).to.deep.equal([
      'save:fr', 'state:true:complete,translated,translated',
      'save:de', 'state:true:complete,complete,translated',
      'save:es', 'state:true:complete,complete,complete',
    ]);
  });

  it('returns page errors and keeps saving the other languages', async () => {
    const ctx = setup({ failLangs: ['fr'] });
    const { errors } = await save(ctx);

    expect(errors).to.have.length(1);
    expect(errors[0].code).to.equal('fr');
    expect(errors[0].text).to.equal('Error saving FR (/a): 500');
    expect(ctx.langs.map((l) => l.translation.status)).to.deep.equal(['error', 'complete', 'complete']);
  });

  it('continues after a language throws', async () => {
    const ctx = setup({ throwLangs: ['de'] });
    const { errors } = await save(ctx);

    expect(errors.map(({ text }) => text)).to.deep.equal(['Error saving DE: de failed']);
    expect(ctx.events.filter((e) => e.startsWith('save:'))).to.deep.equal(['save:fr', 'save:de', 'save:es']);
    expect(ctx.events.filter((e) => e.startsWith('state:'))).to.have.length(3);
    expect(ctx.langs.map((l) => l.translation.status)).to.deep.equal(['complete', 'translated', 'complete']);
  });

  it('reports a failed state save for the language', async () => {
    const ctx = setup();
    ctx.conf.actions.saveState = async () => { throw new Error('Could not save translation progress.'); };
    const { errors } = await save(ctx);

    expect(errors.map(({ text }) => text)).to.deep.equal([
      'Error saving FR: Could not save translation progress.',
      'Error saving DE: Could not save translation progress.',
      'Error saving ES: Could not save translation progress.',
    ]);
  });

  it('skips languages that are already complete', async () => {
    const ctx = setup();
    ctx.langs[1].translation.status = 'complete';
    await save(ctx);

    expect(ctx.events.filter((e) => e.startsWith('save:'))).to.deep.equal(['save:fr', 'save:es']);
  });

  it('saves languages in parallel up to the connector concurrency', async () => {
    const ctx = setup({ concurrency: 3 });
    let active = 0;
    let maxActive = 0;
    const { saveItems } = ctx.connector;
    ctx.connector.saveItems = async (args) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => { setTimeout(resolve, 10); });
      active -= 1;
      return saveItems(args);
    };
    const { errors } = await save(ctx);

    expect(errors).to.deep.equal([]);
    expect(maxActive).to.equal(3);
    expect(ctx.events.filter((e) => e.startsWith('state:'))).to.have.length(3);
  });
});
