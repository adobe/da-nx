import { expect } from '@esm-bundle/chai';
import { fetchEpisodes, fetchEpisodeMessages } from '../../../../../nx2/blocks/chat-ao/utils/episodes.js';
import { AO_HTTP_BASE } from '../../../../../nx2/blocks/chat-ao/ao-constants.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. The same mock URL is reached at
// runtime via the inline importmap when episodes.js's static import of ims.js
// resolves, so both this test and episodes.js receive the *same* mock module instance.
const imsPath = '../../../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

let calls;
let origFetch;

const installFetch = ({ status: httpStatus = 200, body = '{}' } = {}) => {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    calls.push({ url: url.toString(), headers: opts.headers ?? {} });
    return new Response(body, { status: httpStatus });
  };
};

const restoreFetch = () => {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
};

const lastCall = () => calls[calls.length - 1];

describe('episodes.js', () => {
  beforeEach(() => {
    resetMockIms();
    installFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  describe('fetchEpisodes', () => {
    it('requests the episode list with the limit and an auth header', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ episodes: [{ id: '1' }] }) });

      await fetchEpisodes(10);

      expect(lastCall().url).to.equal(`${AO_HTTP_BASE}/api/v1/episodes?limit=10`);
      expect(lastCall().headers.authorization).to.equal('Bearer test-token');
    });

    it('returns the episode list from a successful response', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ episodes: [{ id: '1' }, { id: '2' }] }) });

      const episodes = await fetchEpisodes(10);

      expect(episodes).to.deep.equal([{ id: '1' }, { id: '2' }]);
    });

    it('returns [] when the response has no episodes field', async () => {
      restoreFetch();
      installFetch({ body: '{}' });

      expect(await fetchEpisodes(10)).to.deep.equal([]);
    });

    it('returns [] on a non-ok response', async () => {
      restoreFetch();
      installFetch({ status: 500 });

      expect(await fetchEpisodes(10)).to.deep.equal([]);
    });

    it('returns [] when the fetch itself throws', async () => {
      restoreFetch();
      origFetch = window.fetch;
      window.fetch = async () => { throw new Error('network down'); };

      expect(await fetchEpisodes(10)).to.deep.equal([]);
    });
  });

  describe('fetchEpisodeMessages', () => {
    it('requests root-only turns for the given episode', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ turns: [] }) });

      await fetchEpisodeMessages('ep-1');

      expect(lastCall().url).to.equal(`${AO_HTTP_BASE}/api/v1/episodes/ep-1/turns?root_only=true`);
    });

    it('converts turns into user/assistant messages', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          turns: [
            { user_input: 'hi', final_response: 'hello' },
            { user_input: 'again' },
          ],
        }),
      });

      const messages = await fetchEpisodeMessages('ep-1');

      expect(messages).to.deep.equal([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'again' },
      ]);
    });

    it('returns [] on a non-ok response', async () => {
      restoreFetch();
      installFetch({ status: 404 });

      expect(await fetchEpisodeMessages('ep-1')).to.deep.equal([]);
    });

    it('returns [] when the fetch itself throws', async () => {
      restoreFetch();
      origFetch = window.fetch;
      window.fetch = async () => { throw new Error('network down'); };

      expect(await fetchEpisodeMessages('ep-1')).to.deep.equal([]);
    });
  });
});
