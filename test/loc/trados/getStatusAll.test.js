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
    // Combine both failure modes, on separate source files, into one task list
    const otherFile = sourceCanceled.items.map((t) => (t.input.type === 'sourceFile'
      ? { ...t, input: { ...t.input, sourceFile: { ...t.input.sourceFile, id: 'other-file' } } }
      : t));
    const mixed = [...sourceFailed.items, ...otherFile];
    expect(getSourceFileStatus(mixed)).to.equal('error');
  });

  describe('with task history', () => {
    const task = ({ fileId, key, status, createdAt }) => ({
      status,
      createdAt,
      taskType: { key },
      input: { type: 'sourceFile', sourceFile: { id: fileId } },
    });

    it('should ignore a failure that was later retried', () => {
      const tasks = [
        task({ fileId: 'a', key: 'convert', status: 'failed', createdAt: '2026-11-09T10:00:00Z' }),
        task({ fileId: 'a', key: 'error', status: 'completed', createdAt: '2026-11-09T10:10:00Z' }),
        task({ fileId: 'a', key: 'convert', status: 'completed', createdAt: '2026-11-09T10:20:00Z' }),
      ];
      expect(getSourceFileStatus(tasks)).to.be.null;
    });

    it('should return error while an error-handling task is still open', () => {
      const tasks = [
        task({ fileId: 'a', key: 'convert', status: 'failed', createdAt: '2026-11-09T10:00:00Z' }),
        task({ fileId: 'a', key: 'error', status: 'created', createdAt: '2026-11-09T10:00:10Z' }),
      ];
      expect(getSourceFileStatus(tasks)).to.equal('error');
    });

    it('should use createdAt rather than list order to find the latest task', () => {
      const tasks = [
        task({ fileId: 'a', key: 'convert', status: 'failed', createdAt: '2026-11-09T10:00:00Z' }),
        task({ fileId: 'a', key: 'scan', status: 'completed', createdAt: '2026-11-09T09:00:00Z' }),
      ];
      expect(getSourceFileStatus(tasks)).to.equal('error');
    });

    it('should return error if any one source file is still failed', () => {
      const tasks = [
        task({ fileId: 'a', key: 'convert', status: 'completed', createdAt: '2026-11-09T10:20:00Z' }),
        task({ fileId: 'b', key: 'convert', status: 'failed', createdAt: '2026-11-09T10:00:00Z' }),
      ];
      expect(getSourceFileStatus(tasks)).to.equal('error');
    });
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

  describe('with task history', () => {
    const task = ({ fileId, key, status, createdAt, lang = 'de-DE' }) => ({
      status,
      createdAt,
      taskType: { key },
      input: {
        type: 'targetFile',
        targetFile: { id: fileId, languageDirection: { targetLanguage: { languageCode: lang } } },
      },
    });

    it('should ignore a failure that was later retried', () => {
      const tasks = [
        task({ fileId: 'a', key: 'human-review', status: 'failed', createdAt: '2026-11-09T13:15:19Z' }),
        task({ fileId: 'a', key: 'error', status: 'completed', createdAt: '2026-11-09T16:19:07Z' }),
        task({ fileId: 'a', key: 'final-check', status: 'created', createdAt: '2026-11-10T08:00:00Z' }),
        task({ fileId: 'b', key: 'final-check', status: 'created', createdAt: '2026-11-10T08:00:00Z' }),
      ];
      expect(getLangStatus(tasks, 'de-DE', 2)).to.deep.equal({ status: 'in progress', translated: 0 });
    });

    it('should return translated when every file is delivered despite an earlier failure', () => {
      const tasks = [
        task({ fileId: 'a', key: 'automated-qa-check', status: 'failed', createdAt: '2026-10-28T18:42:30Z' }),
        task({ fileId: 'a', key: 'file-delivery', status: 'completed', createdAt: '2026-11-01T00:00:00Z' }),
      ];
      expect(getLangStatus(tasks, 'de-DE', 1)).to.deep.equal({ status: 'translated', translated: 1 });
    });

    it('should use createdAt rather than list order to find the latest task', () => {
      const tasks = [
        task({ fileId: 'a', key: 'human-review', status: 'failed', createdAt: '2026-11-09T13:15:19Z' }),
        task({ fileId: 'a', key: 'export', status: 'completed', createdAt: '2026-11-08T00:00:00Z' }),
      ];
      expect(getLangStatus(tasks, 'de-DE', 1).status).to.equal('error');
    });

    it('should return error while an error-handling task is still open', () => {
      const tasks = [
        task({ fileId: 'a', key: 'human-review', status: 'failed', createdAt: '2026-11-09T13:15:19Z' }),
        task({ fileId: 'a', key: 'error', status: 'created', createdAt: '2026-11-09T13:15:29Z' }),
      ];
      expect(getLangStatus(tasks, 'de-DE', 1).status).to.equal('error');
    });

    it('should return error if any one file is still failed', () => {
      const tasks = [
        task({ fileId: 'a', key: 'human-review', status: 'created', createdAt: '2026-11-10T00:00:00Z' }),
        task({ fileId: 'b', key: 'import', status: 'failed', createdAt: '2026-11-05T08:06:17Z' }),
      ];
      expect(getLangStatus(tasks, 'de-DE', 2).status).to.equal('error');
    });
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

  it('pages through the tasks list instead of only reading the first page', async () => {
    // de-DE's only task deliberately lands past the first page's limit, so
    // this only passes if getStatusAll actually fetches subsequent pages.
    const fillerTasks = Array.from({ length: 100 }, (_, i) => ({
      id: `filler-${i}`,
      status: 'completed',
      taskType: { key: 'scan' },
      input: { type: 'sourceFile' },
    }));
    const deDeTask = {
      id: 'de-de-completed',
      status: 'completed',
      taskType: { key: 'file-delivery' },
      input: {
        type: 'targetFile',
        targetFile: { languageDirection: { targetLanguage: { languageCode: 'de-DE' } } },
      },
    };
    const allTasks = [...fillerTasks, deDeTask];

    origFetch = window.fetch;
    window.fetch = async (url) => {
      const u = decodeURIComponent(url.toString());
      if (u.includes('/integrations/trados/login')) {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
      }
      if (u.includes('/tasks')) {
        const skip = Number(u.match(/skip=(\d+)/)?.[1] ?? 0);
        const top = Number(u.match(/top=(\d+)/)?.[1] ?? 100);
        const page = allTasks.slice(skip, skip + top);
        const body = { items: page, itemCount: allTasks.length };
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

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

  it('surfaces an error and does not clear it when the tasks fetch fails', async () => {
    origFetch = window.fetch;
    window.fetch = async (url) => {
      const u = decodeURIComponent(url.toString());
      if (u.includes('/integrations/trados/login')) {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
      }
      if (u.includes('/tasks')) return new Response('', { status: 404 });
      return new Response('{}', { status: 200 });
    };

    const service = {
      org: uniq('org'), site: uniq('site'), env: 'prod', tenantId: 'tenant-1', apiEndpoint: 'https://api.sdl.com',
    };
    const langs = [{ code: 'de-DE', translation: { projectId: 'proj-1', status: 'in progress', translated: 0 } }];
    const urls = [{}];
    const messages = [];
    const actions = { sendMessage: (m) => messages.push(m), saveState: async () => {} };

    await getStatusAll({ service, langs, urls, actions });

    expect(langs[0].translation.status).to.equal('in progress');
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage?.type).to.equal('error');
    expect(lastMessage?.text).to.equal('Checking status failed for Trados project.');
  });

  it('recovers from a 401 on the tasks fetch by forcing a fresh login and retrying', async () => {
    let loginCalls = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = decodeURIComponent(url.toString());
      if (u.includes('/integrations/trados/login')) {
        loginCalls += 1;
        return new Response(JSON.stringify({ access_token: `test-token-${loginCalls}`, expires_in: 3600 }), { status: 200 });
      }
      if (u.includes('/tasks')) {
        if (opts.headers.Authorization !== 'Bearer test-token-2') return new Response('', { status: 401 });
        const body = { items: allCompleted.items, itemCount: allCompleted.items.length };
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const service = {
      org: uniq('org'), site: uniq('site'), env: 'prod', tenantId: 'tenant-1', apiEndpoint: 'https://api.sdl.com',
    };
    const langs = [{ code: 'de-DE', translation: { projectId: 'proj-1', status: 'in progress', translated: 0 } }];
    const urls = [{}];
    const actions = { sendMessage: () => {}, saveState: async () => {} };

    await getStatusAll({ service, langs, urls, actions });

    expect(loginCalls).to.equal(2); // initial login + forced re-login on 401
    expect(langs[0].translation.status).to.equal('translated');
  });
});
