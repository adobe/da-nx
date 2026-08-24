import { expect } from '@esm-bundle/chai';
import {
  fetchEpisodes, fetchEpisodeMessages, fetchEpisodeArtifacts, fetchEpisodeContext, warmSession,
  toUiArtifact,
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
    it('requests root-only turns for the given episode, then its artifacts', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ turns: [] }) });

      await fetchEpisodeMessages('ep-1');

      expect(calls[0].url).to.equal(`${AO_HTTP_BASE}/api/v1/episodes/ep-1/turns?root_only=true`);
      expect(calls[1].url).to.equal(`${AO_HTTP_BASE}/api/v1/episodes/ep-1/artifacts`);
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

    it('interleaves a turn\'s ui artifact before its text response, matching AO\'s tool-call-then-text order', async () => {
      restoreFetch();
      calls = [];
      origFetch = window.fetch;
      window.fetch = async (url) => {
        calls.push({ url: url.toString() });
        if (url.toString().includes('/turns')) {
          return new Response(JSON.stringify({
            turns: [{ id: 't1', user_input: 'show me a table', final_response: 'Here it is:' }],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          artifacts: [{
            id: 'a1',
            turn_id: 't1',
            a2ui_surface: { components: [{ type: 'DataTable', props: {} }] },
            text_fallback: 'a table',
            display_hints: { title: 'Results' },
          }],
          has_more: false,
        }), { status: 200 });
      };

      const messages = await fetchEpisodeMessages('ep-1');

      expect(messages).to.deep.equal([
        { role: 'user', content: 'show me a table' },
        {
          role: 'assistant',
          uiArtifact: {
            id: 'a1',
            components: [{ type: 'DataTable', props: {} }],
            textFallback: 'a table',
            title: 'Results',
          },
        },
        { role: 'assistant', content: 'Here it is:' },
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

  describe('fetchEpisodeArtifacts', () => {
    it('requests the episode artifacts endpoint', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ artifacts: [], has_more: false }) });

      await fetchEpisodeArtifacts('ep-1');

      expect(lastCall().url).to.equal(`${AO_HTTP_BASE}/api/v1/episodes/ep-1/artifacts`);
    });

    it('pages through before_artifact_id until has_more is false', async () => {
      restoreFetch();
      calls = [];
      origFetch = window.fetch;
      let call = 0;
      window.fetch = async (url) => {
        calls.push({ url: url.toString() });
        call += 1;
        if (call === 1) {
          return new Response(JSON.stringify({ artifacts: [{ id: 'a2' }], has_more: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ artifacts: [{ id: 'a1' }], has_more: false }), { status: 200 });
      };

      const artifacts = await fetchEpisodeArtifacts('ep-1');

      expect(artifacts).to.deep.equal([{ id: 'a2' }, { id: 'a1' }]);
      expect(calls[0].url).to.equal(`${AO_HTTP_BASE}/api/v1/episodes/ep-1/artifacts`);
      expect(calls[1].url).to.equal(`${AO_HTTP_BASE}/api/v1/episodes/ep-1/artifacts?before_artifact_id=a2`);
    });

    it('returns [] on a non-ok response', async () => {
      restoreFetch();
      installFetch({ status: 500 });

      expect(await fetchEpisodeArtifacts('ep-1')).to.deep.equal([]);
    });

    it('returns [] when the fetch itself throws', async () => {
      restoreFetch();
      origFetch = window.fetch;
      window.fetch = async () => { throw new Error('network down'); };

      expect(await fetchEpisodeArtifacts('ep-1')).to.deep.equal([]);
    });
  });

  describe('toUiArtifact', () => {
    it('maps the wire shape to the shape the renderer expects', () => {
      expect(toUiArtifact({
        id: 'a1',
        a2ui_surface: { components: [{ type: 'Markdown', props: { content: 'hi' } }] },
        text_fallback: 'hi',
        display_hints: { title: 'Summary' },
      })).to.deep.equal({
        id: 'a1',
        components: [{ type: 'Markdown', props: { content: 'hi' } }],
        textFallback: 'hi',
        title: 'Summary',
      });
    });

    it('defaults components to [] and title to undefined when absent', () => {
      expect(toUiArtifact({ id: 'a1', text_fallback: 'hi' })).to.deep.equal({
        id: 'a1',
        components: [],
        textFallback: 'hi',
        title: undefined,
      });
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
