import { expect } from '@esm-bundle/chai';
import {
  fetchEpisodes, fetchEpisodeMessages, fetchEpisodeArtifacts, fetchEpisodeContext, warmSession,
  toUiArtifact, fetchTurnEvents, extractToolCalls, extractSelectionContext,
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

    it('reconstructs one aggregate summary toolCall row per turn with tool_call_count > 0, before the text', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          turns: [{
            id: 't1', user_input: 'update the page', final_response: 'Done.', tool_call_count: 2,
          }],
        }),
      });

      const messages = await fetchEpisodeMessages('ep-1');

      expect(messages).to.deep.equal([
        { role: 'user', content: 'update the page' },
        {
          role: 'assistant',
          toolCall: {
            toolCallId: 't1:summary', status: 'summary', summaryText: 'Used 2 tools', turnId: 't1',
          },
        },
        { role: 'assistant', content: 'Done.' },
      ]);
    });

    it('singularizes the summary text for exactly one tool call', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({ turns: [{ id: 't1', tool_call_count: 1 }] }),
      });

      const messages = await fetchEpisodeMessages('ep-1');

      expect(messages[0].toolCall.summaryText).to.equal('Used 1 tool');
    });

    it('adds no toolCall row for a turn with no tool calls', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({ turns: [{ id: 't1', user_input: 'hi', final_response: 'hey' }] }),
      });

      const messages = await fetchEpisodeMessages('ep-1');

      expect(messages).to.deep.equal([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hey' },
      ]);
    });

    it('reconstructs the user message\'s selectionContext from its turn events, as a pill not prose', async () => {
      restoreFetch();
      origFetch = window.fetch;
      window.fetch = async (url) => {
        const href = url.toString();
        if (href.includes('/turns')) {
          return new Response(JSON.stringify({
            turns: [{ id: 't1', user_input: 'update this' }],
          }), { status: 200 });
        }
        if (href.includes('/events/turn/')) {
          return new Response(JSON.stringify({
            events: [{
              type: 'user_message',
              client_context: {
                focused_resources: [
                  { type: 'document', id: 'adobe/site/page', name: '/page' },
                  { type: 'block', id: 'a', name: 'hero' },
                  { type: 'text-selection', name: 'hello world' },
                ],
              },
            }],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ artifacts: [], has_more: false }), { status: 200 });
      };

      const messages = await fetchEpisodeMessages('ep-1');

      expect(messages[0]).to.deep.equal({
        role: 'user',
        content: 'update this',
        selectionContext: [
          { type: 'block', blockName: 'hero' },
          { type: 'text', innerHTML: 'hello world' },
        ],
      });
    });

    it('omits selectionContext when the turn carried only the document resource', async () => {
      restoreFetch();
      origFetch = window.fetch;
      window.fetch = async (url) => {
        const href = url.toString();
        if (href.includes('/turns')) {
          return new Response(JSON.stringify({ turns: [{ id: 't1', user_input: 'hi' }] }), { status: 200 });
        }
        if (href.includes('/events/turn/')) {
          return new Response(JSON.stringify({
            events: [{
              type: 'user_message',
              client_context: { focused_resources: [{ type: 'document', id: 'a/b/c', name: '/c' }] },
            }],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ artifacts: [], has_more: false }), { status: 200 });
      };

      const messages = await fetchEpisodeMessages('ep-1');

      expect(messages[0]).to.deep.equal({ role: 'user', content: 'hi' });
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

  describe('fetchTurnEvents', () => {
    it('requests the turn events endpoint', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ events: [] }) });

      await fetchTurnEvents('t1');

      expect(lastCall().url).to.equal(`${AO_HTTP_BASE}/api/v1/events/turn/t1`);
    });

    it('returns the events array from a successful response', async () => {
      restoreFetch();
      installFetch({ body: JSON.stringify({ events: [{ type: 'user_message' }] }) });

      expect(await fetchTurnEvents('t1')).to.deep.equal([{ type: 'user_message' }]);
    });

    it('returns [] on a non-ok response', async () => {
      restoreFetch();
      installFetch({ status: 500 });

      expect(await fetchTurnEvents('t1')).to.deep.equal([]);
    });

    it('returns [] when the fetch itself throws', async () => {
      restoreFetch();
      origFetch = window.fetch;
      window.fetch = async () => { throw new Error('network down'); };

      expect(await fetchTurnEvents('t1')).to.deep.equal([]);
    });
  });

  describe('extractToolCalls', () => {
    it('joins an assistant_message tool call with its matching tool_result', () => {
      const toolCalls = extractToolCalls([
        {
          type: 'assistant_message',
          tool_calls: [{ id: 'tc1', name: 'skill', arguments: '{"skill_name":"x"}' }],
        },
        {
          type: 'tool_result',
          tool_call_id: 'tc1',
          tool_name: 'skill',
          result: 'full raw body',
          status: 'success',
          duration_s: 0.03,
          metadata: { skill_title: 'AEM Sites DA Page Update' },
        },
      ]);

      expect(toolCalls).to.deep.equal([{
        toolCallId: 'tc1',
        toolName: 'skill',
        arguments: { skill_name: 'x' },
        result: 'full raw body',
        status: 'success',
        durationS: 0.03,
        title: 'AEM Sites DA Page Update',
      }]);
    });

    it('prefers display_result over the raw result when both are present', () => {
      const toolCalls = extractToolCalls([
        { type: 'assistant_message', tool_calls: [{ id: 'tc1', name: 'read_file', arguments: '{}' }] },
        {
          type: 'tool_result',
          tool_call_id: 'tc1',
          result: 'the entire file contents...',
          display_result: 'Read file: foo.txt',
          status: 'success',
        },
      ]);

      expect(toolCalls[0].result).to.equal('Read file: foo.txt');
    });

    it('marks a call still running when no matching tool_result exists yet', () => {
      const toolCalls = extractToolCalls([
        { type: 'assistant_message', tool_calls: [{ id: 'tc1', name: 'skill', arguments: '{}' }] },
      ]);

      expect(toolCalls[0].status).to.equal('running');
      expect(toolCalls[0].result).to.equal(undefined);
    });

    it('preserves call order across multiple tool calls in the same turn', () => {
      const toolCalls = extractToolCalls([
        {
          type: 'assistant_message',
          tool_calls: [
            { id: 'tc1', name: 'read_file', arguments: '{}' },
            { id: 'tc2', name: 'skill', arguments: '{}' },
          ],
        },
        { type: 'tool_result', tool_call_id: 'tc1', result: 'a', status: 'success' },
        { type: 'tool_result', tool_call_id: 'tc2', result: 'b', status: 'success' },
      ]);

      expect(toolCalls.map((c) => c.toolCallId)).to.deep.equal(['tc1', 'tc2']);
    });

    it('does not throw on malformed JSON arguments, defaulting to {}', () => {
      const toolCalls = extractToolCalls([
        { type: 'assistant_message', tool_calls: [{ id: 'tc1', name: 'skill', arguments: '{not json' }] },
      ]);

      expect(toolCalls[0].arguments).to.deep.equal({});
    });

    it('returns [] for an empty or missing events list', () => {
      expect(extractToolCalls([])).to.deep.equal([]);
      expect(extractToolCalls(undefined)).to.deep.equal([]);
    });

    it('keeps a genuine tool failure as status "error"', () => {
      const toolCalls = extractToolCalls([
        { type: 'assistant_message', tool_calls: [{ id: 'tc1', name: 'skill', arguments: '{}' }] },
        {
          type: 'tool_result',
          tool_call_id: 'tc1',
          result: 'Tool execution failed.',
          error: 'Tool execution failed.',
          status: 'error',
        },
      ]);

      expect(toolCalls[0].status).to.equal('error');
    });
  });

  describe('extractSelectionContext', () => {
    it('reconstructs a block selection into the same shape selectionResource() started from', () => {
      const selectionContext = extractSelectionContext([{
        type: 'user_message',
        client_context: { focused_resources: [{ type: 'block', id: 'a', name: 'hero' }] },
      }]);

      expect(selectionContext).to.deep.equal([{ type: 'block', blockName: 'hero' }]);
    });

    it('reconstructs a text-selection resource into the {type: "text", innerHTML} pill shape', () => {
      const selectionContext = extractSelectionContext([{
        type: 'user_message',
        client_context: { focused_resources: [{ type: 'text-selection', name: 'hello world' }] },
      }]);

      expect(selectionContext).to.deep.equal([{ type: 'text', innerHTML: 'hello world' }]);
    });

    it('filters out the document resource — it was never a pill', () => {
      const selectionContext = extractSelectionContext([{
        type: 'user_message',
        client_context: {
          focused_resources: [
            { type: 'document', id: 'adobe/site/page', name: '/page' },
            { type: 'block', id: 'a', name: 'hero' },
          ],
        },
      }]);

      expect(selectionContext).to.deep.equal([{ type: 'block', blockName: 'hero' }]);
    });

    it('preserves the order of multiple selected resources', () => {
      const selectionContext = extractSelectionContext([{
        type: 'user_message',
        client_context: {
          focused_resources: [
            { type: 'block', id: 'a', name: 'hero' },
            { type: 'text-selection', name: 'hello world' },
          ],
        },
      }]);

      expect(selectionContext).to.deep.equal([
        { type: 'block', blockName: 'hero' },
        { type: 'text', innerHTML: 'hello world' },
      ]);
    });

    it('returns [] when the turn carried no client_context, no focused_resources, or no events at all', () => {
      expect(extractSelectionContext([{ type: 'user_message' }])).to.deep.equal([]);
      expect(extractSelectionContext([{ type: 'user_message', client_context: {} }])).to.deep.equal([]);
      expect(extractSelectionContext([])).to.deep.equal([]);
      expect(extractSelectionContext(undefined)).to.deep.equal([]);
    });

    it('returns [] when the events list has no user_message event', () => {
      const selectionContext = extractSelectionContext([{ type: 'assistant_message', tool_calls: [] }]);

      expect(selectionContext).to.deep.equal([]);
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

    it('extracts turnId/calls from a permission-suspended turn, via the always-present pendingCalls field', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          suspendedTurn: {
            turnId: 't1',
            suspendReason: 'permission',
            pendingCalls: [{
              id: 'tc1',
              name: 'da__da_copy_content',
              arguments: { sourcePath: '/coffee', destinationPath: '/drafts/coffee-2' },
              needs_permission: true,
            }],
          },
        }),
      });

      expect(await fetchEpisodeContext('ep-1')).to.deep.equal({
        type: 'permission',
        turnId: 't1',
        calls: [{
          toolCallId: 'tc1',
          toolName: 'da__da_copy_content',
          arguments: { sourcePath: '/coffee', destinationPath: '/drafts/coffee-2' },
        }],
      });
    });

    it('returns null when the suspended turn has neither questionData, planData, nor pendingCalls', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          suspendedTurn: { turnId: 't1', suspendReason: 'entity_mutation' },
        }),
      });

      expect(await fetchEpisodeContext('ep-1')).to.equal(null);
    });

    it('returns null when pendingCalls is present but empty — always on the response, not permission-specific', async () => {
      restoreFetch();
      installFetch({
        body: JSON.stringify({
          suspendedTurn: { turnId: 't1', suspendReason: 'user_question', pendingCalls: [] },
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
