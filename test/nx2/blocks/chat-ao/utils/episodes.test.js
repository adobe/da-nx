import { expect } from '@esm-bundle/chai';
import {
  fetchEpisodes, fetchEpisodeMessages, fetchEpisodeContext, warmSession,
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
    calls.push({
      url: url.toString(), headers: opts.headers ?? {}, method: opts.method, body: opts.body,
    });
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

    it('extracts turnId/planContent/planFilePath from a plan-approval-suspended turn', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          suspendedTurn: {
            turnId: 't1',
            suspendReason: 'plan_approval',
            planData: { planContent: '# Plan', planFilePath: '.ao/plans/x.md' },
          },
        }),
      });

      expect(await fetchEpisodeContext('ep-1')).to.deep.equal({
        type: 'plan',
        turnId: 't1',
        planContent: '# Plan',
        planFilePath: '.ao/plans/x.md',
      });
    });

    it('returns null when the suspended turn has neither questionData nor planData', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          suspendedTurn: { turnId: 't1', suspendReason: 'entity_mutation' },
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
        type: 'question',
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

  describe('warmSession', () => {
    it('POSTs the episode id to the sessions endpoint', async () => {
      restoreFetch();
      installFetch({ body: '{}' });

      await warmSession('ep-1');

      expect(lastCall().url).to.equal(`${AO_HTTP_BASE}/api/v1/sessions`);
      expect(lastCall().method).to.equal('POST');
      expect(JSON.parse(lastCall().body)).to.deep.equal({ episodeId: 'ep-1' });
      expect(lastCall().headers.authorization).to.equal('Bearer test-token');
    });

    it('does not throw on a non-ok response (e.g. manifest not running in Temporal mode)', async () => {
      restoreFetch();
      installFetch({ status: 400 });

      await warmSession('ep-1'); // rejecting would fail this test
    });

    it('does not throw when the fetch itself throws', async () => {
      restoreFetch();
      origFetch = window.fetch;
      window.fetch = async () => { throw new Error('network down'); };

      await warmSession('ep-1'); // rejecting would fail this test
    });
  });
});
