import { expect } from '@esm-bundle/chai';
import { saveItems } from '../../../nx/blocks/loc/connectors/trados/index.js';

const API_ENDPOINT = 'https://api.sdl.com';

let origFetch;

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

describe('saveItems', () => {
  afterEach(() => {
    restoreFetch();
  });

  it('paginates the target-files fetch instead of only reading the first page', async () => {
    // The real target-file for sf-1 deliberately lands past the first
    // page's limit, so this only passes if saveItems actually fetches
    // subsequent pages instead of only reading the first.
    const fillerFiles = Array.from({ length: 100 }, (_, i) => ({
      id: `filler-${i}`,
      latestVersion: { id: 'v-filler' },
      languageDirection: { targetLanguage: { languageCode: 'fr-FR' } },
      sourceFile: { id: `filler-source-${i}` },
    }));
    const realTargetFile = {
      id: 'tf-1',
      latestVersion: { id: 'v1' },
      languageDirection: { targetLanguage: { languageCode: 'fr-FR' } },
      sourceFile: { id: 'sf-1' },
    };
    const allTargetFiles = [...fillerFiles, realTargetFile];

    origFetch = window.fetch;
    window.fetch = async (url) => {
      const u = decodeURIComponent(url.toString());
      if (u.includes('/integrations/trados/login')) {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
      }
      if (u.includes('/target-files/tf-1/versions/v1/download')) {
        return new Response('<html><body><main><div>Translated</div></main></body></html>', { status: 200 });
      }
      if (u.includes('/target-files')) {
        const skip = Number(u.match(/skip=(\d+)/)?.[1] ?? 0);
        const top = Number(u.match(/top=(\d+)/)?.[1] ?? 100);
        const page = allTargetFiles.slice(skip, skip + top);
        const body = { items: page, itemCount: allTargetFiles.length };
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const saved = [];
    const url = { daBasePath: '/page', sourceFileId: 'sf-1' };
    const lang = { code: 'fr-FR', translation: { projectId: 'proj-1' } };

    await saveItems({
      org: 'acme',
      site: 'site1',
      service: { org: 'acme', site: 'site1', env: 'prod', tenantId: 'tenant-1', apiEndpoint: API_ENDPOINT },
      lang,
      urls: [url],
      saveFn: async (u) => { saved.push(u); u.status = 'success'; },
    });

    expect(saved).to.have.length(1);
    expect(url.sourceContent).to.include('Translated');
  });
});
