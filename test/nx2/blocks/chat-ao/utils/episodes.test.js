import { expect } from '@esm-bundle/chai';
import {
  fetchEpisodes, fetchEpisodeMessages, fetchEpisodeContext,
} from '../../../../../nx2/blocks/chat-ao/utils/episodes.js';
import { AO_HTTP_BASE } from '../../../../../nx2/blocks/chat-ao/ao-constants.js';

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

  describe('fetchEpisodeContext', () => {
    it('requests the episode context endpoint', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ suspendedTurn: null }) });

      await fetchEpisodeContext('ep-1');

      expect(lastCall().url).to.equal(`${AO_HTTP_BASE}/api/v1/episodes/ep-1/context`);
    });

    it('returns null when there is no suspended turn', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ suspendedTurn: null }) });

      expect(await fetchEpisodeContext('ep-1')).to.equal(null);
    });

    it('returns null when the suspended turn is not a question (e.g. a plan approval)', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          suspendedTurn: { turnId: 't1', suspendReason: 'plan_approval', planData: {} },
        }),
      });

      expect(await fetchEpisodeContext('ep-1')).to.equal(null);
    });

    it('extracts turnId/context/questions from a question-suspended turn', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          suspendedTurn: {
            turnId: 't1',
            suspendReason: 'user_question',
            questionData: {
              context: 'Please confirm.',
              questions: [{ id: '1', header: 'Publish page' }],
            },
          },
        }),
      });

      expect(await fetchEpisodeContext('ep-1')).to.deep.equal({
        turnId: 't1',
        context: 'Please confirm.',
        questions: [{ id: '1', header: 'Publish page' }],
      });
    });

    it('returns null on a non-ok response', async () => {
      restoreFetch();
      installFetch({ status: 404 });

      expect(await fetchEpisodeContext('ep-1')).to.equal(null);
    });

    it('returns null when the fetch itself throws', async () => {
      restoreFetch();
      origFetch = window.fetch;
      window.fetch = async () => { throw new Error('network down'); };

      expect(await fetchEpisodeContext('ep-1')).to.equal(null);
    });
  });
});
