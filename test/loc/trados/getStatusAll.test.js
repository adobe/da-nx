import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { getSourceFileStatus, getLangStatus, getStatusAll } from '../../../nx/blocks/loc/connectors/trados/index.js';

async function loadMock(name) {
  const text = await readFile({ path: `./mocks/${name}.json` });
  return JSON.parse(text);
}

let allCompleted;
let sourceFailed;
let sourceCanceled;
let langPartial;
let langFailed;

before(async () => {
  [allCompleted, sourceFailed, sourceCanceled, langPartial, langFailed] = await Promise.all([
    loadMock('all-completed'),
    loadMock('source-failed'),
    loadMock('source-canceled'),
    loadMock('lang-partial'),
    loadMock('lang-failed'),
  ]);
});

// --- getSourceFileStatus ---

describe('getSourceFileStatus', () => {
  it('should return null when all source tasks completed', () => {
    expect(getSourceFileStatus(allCompleted.items)).to.be.null;
  });

  it('should return null for empty tasks array', () => {
    expect(getSourceFileStatus([])).to.be.null;
  });

  it('should return null when no source tasks exist (only lang tasks)', () => {
    const langOnly = allCompleted.items.filter((t) => t.input.type === 'targetFile');
    expect(getSourceFileStatus(langOnly)).to.be.null;
  });

  it('should return error when a source task failed', () => {
    expect(getSourceFileStatus(sourceFailed.items)).to.equal('error');
  });

  it('should return canceled when a source task is canceled', () => {
    expect(getSourceFileStatus(sourceCanceled.items)).to.equal('canceled');
  });

  it('should prioritize failed over canceled', () => {
    // Combine both failure modes into one task list
    const mixed = [...sourceFailed.items, ...sourceCanceled.items];
    expect(getSourceFileStatus(mixed)).to.equal('error');
  });
});

// --- getLangStatus ---

describe('getLangStatus', () => {
  it('should return translated when all file-delivery tasks completed (de-DE)', () => {
    const result = getLangStatus(allCompleted.items, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return translated when all file-delivery tasks completed (fr-FR)', () => {
    const result = getLangStatus(allCompleted.items, 'fr-FR', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return in progress when delivery not complete for lang', () => {
    // lang-partial has de-DE delivered but fr-FR only through machine-translation
    const result = getLangStatus(langPartial.items, 'fr-FR', 1);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(0);
  });

  it('should return translated for lang that is fully delivered', () => {
    const result = getLangStatus(langPartial.items, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return in progress for empty tasks', () => {
    const result = getLangStatus([], 'de-DE', 1);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(0);
  });

  it('should return error when a lang task failed', () => {
    // lang-failed has fr-FR machine-translation failed
    const result = getLangStatus(langFailed.items, 'fr-FR', 1);
    expect(result.status).to.equal('error');
    expect(result.translated).to.equal(0);
  });

  it('should not be affected by other language failures', () => {
    // de-DE should still be translated even though fr-FR failed
    const result = getLangStatus(langFailed.items, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return translated count even on error', () => {
    // lang-failed has de-DE file-delivery completed but fr-FR failed
    const result = getLangStatus(langFailed.items, 'fr-FR', 1);
    expect(result.translated).to.equal(0);
  });

  it('should return in progress when fileCount exceeds delivered', () => {
    // all-completed has 1 file-delivery per lang, but we say there are 5 files
    const result = getLangStatus(allCompleted.items, 'de-DE', 5);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(1);
  });
});

// --- getStatusAll ---

describe('getStatusAll', () => {
  let origFetch;
  let counter = 0;

  const uniq = (label) => {
    counter += 1;
    return `${label}-${counter}-${Math.floor(Math.random() * 1e6)}`;
  };

  function installFetch(tasks) {
    origFetch = window.fetch;
    window.fetch = async (url) => {
      // corsFetch proxies through ?url=<encodeURIComponent(target)>, so
      // decode before substring-matching the real target path.
      const u = decodeURIComponent(url.toString());
      if (u.includes('/integrations/trados/login')) {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
      }
      if (u.includes('/tasks')) {
        return new Response(JSON.stringify({ items: tasks }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };
  }

  afterEach(() => {
    if (origFetch) window.fetch = origFetch;
    origFetch = null;
  });

  it('does not revert a lang already saved to DA back to "translated"', async () => {
    installFetch(allCompleted.items);

    const service = {
      org: uniq('org'), site: uniq('site'), env: 'prod', tenantId: 'tenant-1', apiEndpoint: 'https://api.sdl.com',
    };
    const langs = [{ code: 'de-DE', translation: { projectId: 'proj-1', status: 'complete', translated: 1 } }];
    const urls = [{}];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await getStatusAll({ service, langs, urls, actions });

    expect(langs[0].translation.status).to.equal('complete');
  });

  it('does not revert a cancelled lang back to "translated"', async () => {
    installFetch(allCompleted.items);

    const service = {
      org: uniq('org'), site: uniq('site'), env: 'prod', tenantId: 'tenant-1', apiEndpoint: 'https://api.sdl.com',
    };
    const langs = [{ code: 'de-DE', translation: { projectId: 'proj-1', status: 'cancelled', translated: 0 } }];
    const urls = [{}];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await getStatusAll({ service, langs, urls, actions });

    expect(langs[0].translation.status).to.equal('cancelled');
  });

  it('still updates a lang that is not yet complete', async () => {
    installFetch(allCompleted.items);

    const service = {
      org: uniq('org'), site: uniq('site'), env: 'prod', tenantId: 'tenant-1', apiEndpoint: 'https://api.sdl.com',
    };
    const langs = [{ code: 'de-DE', translation: { projectId: 'proj-1', status: 'in progress', translated: 0 } }];
    const urls = [{}];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await getStatusAll({ service, langs, urls, actions });

    expect(langs[0].translation.status).to.equal('translated');
    expect(langs[0].translation.translated).to.equal(1);
  });
});
